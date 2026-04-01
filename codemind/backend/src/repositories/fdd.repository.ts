import { PrismaClient, FunctionalDoc, FddRequirement, FddStatus, RequirementClassification } from '@prisma/client'
import type { RawRequirement } from '../services/fdd-extraction.service'

export type FunctionalDocWithRequirements = FunctionalDoc & { requirements: FddRequirement[] }

export class FddRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    repositoryId: string
    uploadedById?: string
    fileName: string
    mimeType: string
  }): Promise<FunctionalDoc> {
    return this.prisma.functionalDoc.create({ data: { ...data, rawText: '' } })
  }

  async findById(id: string): Promise<FunctionalDocWithRequirements | null> {
    return this.prisma.functionalDoc.findUnique({
      where: { id },
      include: { requirements: { orderBy: { order: 'asc' } } },
    })
  }

  async findByRepo(repositoryId: string): Promise<FunctionalDoc[]> {
    return this.prisma.functionalDoc.findMany({
      where: { repositoryId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async updateStatus(id: string, status: FddStatus, errorMessage?: string): Promise<void> {
    await this.prisma.functionalDoc.update({
      where: { id },
      data: { status, ...(errorMessage !== undefined && { errorMessage }) },
    })
  }

  async setRawText(id: string, rawText: string): Promise<void> {
    await this.prisma.functionalDoc.update({ where: { id }, data: { rawText } })
  }

  async setBullJobId(fddId: string, bullJobId: string): Promise<void> {
    await this.prisma.functionalDoc.update({ where: { id: fddId }, data: { bullJobId } })
  }

  async upsertRequirements(fddId: string, reqs: RawRequirement[]): Promise<FddRequirement[]> {
    // Delete existing requirements first (re-extract scenario)
    await this.prisma.fddRequirement.deleteMany({ where: { fddId } })
    return this.prisma.$transaction(
      reqs.map((r, i) =>
        this.prisma.fddRequirement.create({
          data: { fddId, order: i + 1, title: r.title, description: r.description },
        })
      )
    )
  }

  async updateRequirementClassification(
    id: string,
    classification: RequirementClassification,
    rationale: string,
  ): Promise<void> {
    await this.prisma.fddRequirement.update({ where: { id }, data: { classification, rationale } })
  }

  async linkRequirementToTask(requirementId: string, taskId: string): Promise<void> {
    await this.prisma.fddRequirement.update({ where: { id: requirementId }, data: { taskId } })
  }
}
