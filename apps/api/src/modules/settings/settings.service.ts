import { Injectable } from '@nestjs/common';
import { AppSettings, settingsSchema } from '@odonto/shared';
import { PrismaService } from '../../common/prisma.service';
import { AppConfig } from '../../config/app-config';

const KEY = 'app';
const CACHE_MS = 30_000;

@Injectable()
export class SettingsService {
  private cache: { value: AppSettings; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  defaults(): AppSettings {
    return {
      allowedDomains: this.config.defaultAllowedDomains,
      blockedEmailPatterns: this.config.defaultBlockedEmailPatterns,
      bookingLeadMinutes: 60,
      maxActivePerPatient: 1,
      emailNotifications: true,
      clinicName: 'Consultorio Médico y Odontológico UETS',
      clinicLocation: 'Consultorio médico UETS',
    };
  }

  async get(): Promise<AppSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const row = await this.prisma.setting.findUnique({ where: { key: KEY } });
    const parsed = settingsSchema.safeParse({ ...this.defaults(), ...((row?.value as object) ?? {}) });
    const value = parsed.success ? parsed.data : this.defaults();
    this.cache = { value, at: Date.now() };
    return value;
  }

  async update(value: AppSettings): Promise<AppSettings> {
    await this.prisma.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value },
      update: { value },
    });
    this.cache = null;
    return this.get();
  }
}
