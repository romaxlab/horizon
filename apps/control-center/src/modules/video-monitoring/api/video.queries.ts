export const videoQueryKeys = {
  source: (uavId: string) => ['video', 'source', uavId] as const,
}
