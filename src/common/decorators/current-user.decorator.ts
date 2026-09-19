import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser, AuthenticatedUserWithRefreshToken } from '../../modules/auth/types/jwt-payload.interface';

export const CurrentUser = createParamDecorator(
  <T = AuthenticatedUser | AuthenticatedUserWithRefreshToken>(
    data: keyof T | undefined,
    ctx: ExecutionContext,
  ): T | T[keyof T] | null => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as T | undefined;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
