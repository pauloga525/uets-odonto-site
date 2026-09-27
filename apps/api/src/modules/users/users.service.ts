import { Injectable } from '@nestjs/common';
import { Doctor, Prisma, User } from '@prisma/client';
import { PageDto, Role, UpdateUserInput, UserDto } from '@odonto/shared';
import { AuthUser } from '../../common/auth-context';
import { DomainException } from '../../common/domain.exception';
import { PrismaService } from '../../common/prisma.service';

type UserWithDoctor = User & { doctor?: Doctor | null };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  toDto(u: UserWithDoctor): UserDto {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      avatarUrl: u.avatarUrl,
      role: u.role as Role,
      active: u.active,
      consentAt: u.consentAt?.toISOString() ?? null,
      doctorId: u.doctor?.id ?? null,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    };
  }

  async findById(id: string): Promise<UserWithDoctor> {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { doctor: true } });
    if (!u) throw DomainException.notFound('Usuario no encontrado');
    return u;
  }

  async findAuthUser(id: string): Promise<AuthUser | null> {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { doctor: { select: { id: true } } } });
    if (!u || !u.active) return null;
    return { id: u.id, email: u.email, name: u.name, role: u.role as Role, doctorId: u.doctor?.id ?? null };
  }

  async ensureDoctorProfile(userId: string, name: string, tx: Prisma.TransactionClient = this.prisma): Promise<Doctor> {
    return tx.doctor.upsert({
      where: { userId },
      create: { userId, displayName: name },
      update: { active: true },
    });
  }

  async recordConsent(id: string) {
    return this.prisma.user.update({ where: { id }, data: { consentAt: new Date() }, include: { doctor: true } });
  }

  async list(q: { search?: string; role?: string; page: number; pageSize: number }): Promise<PageDto<UserDto>> {
    const where: Prisma.UserWhereInput = {
      role: q.role as Role | undefined,
      ...(q.search
        ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { doctor: true },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items: rows.map((u) => this.toDto(u)) };
  }

  async update(id: string, input: UpdateUserInput, actor: AuthUser): Promise<{ before: UserDto; after: UserDto }> {
    const before = await this.findById(id);
    if (id === actor.id && (input.active === false || (input.role && input.role !== before.role))) {
      throw DomainException.unprocessable('VALIDATION', 'No puedes desactivarte ni cambiar tu propio rol.');
    }
    const after = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { role: input.role as Role | undefined, active: input.active, name: input.name },
        include: { doctor: true },
      });
      if (u.role === 'DOCTOR') {
        await this.ensureDoctorProfile(u.id, u.name, tx);
      } else if (u.doctor) {
        await tx.doctor.update({ where: { id: u.doctor.id }, data: { active: false } });
      }
      if (input.active === false) {
        await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      return tx.user.findUniqueOrThrow({ where: { id }, include: { doctor: true } });
    });
    return { before: this.toDto(before), after: this.toDto(after) };
  }
}
