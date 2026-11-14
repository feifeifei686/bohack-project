import { seedProposals, type Proposal, type Requirement } from './domain.ts'

export const proposalSamples = [
  { id: 'a' as const, name: '木序设计', title: '温润原木 · 实用收纳', image: 'atelier.webp', description: '以浅木色与封闭收纳为主，优先梳理现有布局和日常使用动线。', highlights: ['保留与调整范围分开说明', '设备位置与安装条件逐项列出', '材料与清洁方式一起考虑'] },
  { id: 'b' as const, name: '栖居营造', title: '清透浅色 · 灵活空间', image: 'lucid.webp', description: '用浅色材质统一空间，提供可选做法，方便比较收纳与视觉效果。', highlights: ['提供不同布局的选择', '比较开放与封闭收纳', '公共交界与细部收口单独说明'] },
]

/** Local illustrative responses, never represented as submissions from real merchants. */
export function createSampleProposal(requirements: Requirement[], revision: number, vendorId: 'a' | 'b', previous?: Proposal): Proposal {
  const sample = seedProposals(requirements, revision).find(p => p.vendorId === vendorId)!
  const version = (previous?.version || 0) + 1
  return {
    ...sample, id: `sample-${vendorId}-r${revision}-v${version}`, version,
    items: sample.items.map((item, index) => {
      if (item.commitment !== 'unknown') return item
      const requirement = requirements[index]
      const approach = vendorId === 'a' ? '先检查现有条件，优先保留可用部分，再补齐安装与收口说明。' : '先提供可选布局与材料做法，再按使用习惯确认细节。'
      return { ...item, commitment: 'partial', text: `演示回应：针对“${requirement.title}”，${approach}具体要求“${requirement.description}”仍需逐项落实；现场尺寸、设备条件与可行性待确认。` }
    }),
  }
}
