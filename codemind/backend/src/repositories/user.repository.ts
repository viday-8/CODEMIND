import { PrismaClient, User } from '@prisma/client'

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: { email: string; name: string; passwordHash: string }): Promise<User> {
    return this.prisma.user.create({ data })
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } })
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } })
  }
}
