import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

export class PasswordService {
  static isBcrypt(stored: string): boolean {
    return stored.startsWith('$2');
  }

  static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  static async verify(password: string, stored: string): Promise<boolean> {
    if (PasswordService.isBcrypt(stored)) {
      return bcrypt.compare(password, stored);
    }
    // Plaintext fallback for migration
    return password === stored;
  }
}
