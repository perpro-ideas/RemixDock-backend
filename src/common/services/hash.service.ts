import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class HashService {
  async hash(plainText: string): Promise<string> {
    return argon2.hash(plainText);
  }

  async compare(plainText: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, plainText);
  }
}
