import { Test, TestingModule } from '@nestjs/testing';
import { HashService } from './hash.service';

describe('HashService', () => {
  let service: HashService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HashService],
    }).compile();

    service = module.get<HashService>(HashService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should hash a plain text password using argon2', async () => {
    const plainText = 'SecurePassword123!';
    const hashed = await service.hash(plainText);

    expect(hashed).toBeDefined();
    expect(typeof hashed).toBe('string');
    expect(hashed).not.toBe(plainText);
    expect(hashed.startsWith('$argon2')).toBe(true);
  });

  it('should return true when comparing correct plain text with hash', async () => {
    const plainText = 'SecurePassword123!';
    const hashed = await service.hash(plainText);

    const isMatch = await service.compare(plainText, hashed);
    expect(isMatch).toBe(true);
  });

  it('should return false when comparing incorrect plain text with hash', async () => {
    const plainText = 'SecurePassword123!';
    const wrongText = 'WrongPassword456!';
    const hashed = await service.hash(plainText);

    const isMatch = await service.compare(wrongText, hashed);
    expect(isMatch).toBe(false);
  });
});
