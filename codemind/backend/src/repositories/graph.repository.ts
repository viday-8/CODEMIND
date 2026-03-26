import { PrismaClient, NodeType, EdgeLabel } from '@prisma/client'

interface NodeInput {
  repositoryId: string
  fileId: string
  nodeType: NodeType
  name: string
  fullName: string
  startLine: number
  endLine: number
}

interface EdgeInput {
  fromId: string
  toId: string
  label: EdgeLabel
}

export class GraphRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertNodes(nodes: NodeInput[]): Promise<string[]> {
    // Create nodes in batches, return their IDs
    const created = await Promise.all(
      nodes.map((n) =>
        this.prisma.graphNode.create({ data: n, select: { id: true, fullName: true } }),
      ),
    )
    return created.map((c) => c.id)
  }

  async createEdges(edges: EdgeInput[]): Promise<void> {
    if (edges.length === 0) return
    await this.prisma.graphEdge.createMany({ data: edges, skipDuplicates: true })
  }

  async findNodeByFullName(repositoryId: string, fullName: string) {
    return this.prisma.graphNode.findFirst({ where: { repositoryId, fullName } })
  }

  async findEdgesFrom(nodeId: string) {
    return this.prisma.graphEdge.findMany({
      where: { fromId: nodeId },
      include: { to: true },
    })
  }

  async findEdgesTo(nodeId: string) {
    return this.prisma.graphEdge.findMany({
      where: { toId: nodeId },
      include: { from: true },
    })
  }

  async findFileNodeByPath(repositoryId: string, path: string) {
    return this.prisma.graphNode.findFirst({
      where: { repositoryId, nodeType: 'FILE', fullName: path },
    })
  }

  async findChildNodes(fileNodeId: string) {
    // Returns FUNCTION/CLASS/METHOD nodes that belong to the same file as the given FILE node
    const fileNode = await this.prisma.graphNode.findUnique({
      where: { id: fileNodeId },
      select: { fileId: true },
    })
    if (!fileNode) return []
    return this.prisma.graphNode.findMany({
      where: {
        fileId: fileNode.fileId,
        nodeType: { in: ['FUNCTION', 'CLASS', 'METHOD'] },
      },
    })
  }

  async deleteForRepo(repositoryId: string): Promise<void> {
    // Edges are cascade-deleted with nodes
    await this.prisma.graphNode.deleteMany({ where: { repositoryId } })
  }
}
