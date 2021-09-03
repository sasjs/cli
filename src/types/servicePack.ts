export interface ServicePack {
  members: ServicePackMember[]
}

export interface ServicePackMember {
  name: string
  type: 'folder' | 'service' | 'file'
  code?: string
  members?: ServicePackMember[]
}
