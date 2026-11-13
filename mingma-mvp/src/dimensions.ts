/**
 * Discovery dimensions for both sides of a renovation project.
 * `required` means the information must be discussed or explicitly deferred.
 * It does not mean a construction item is mandatory or professionally feasible.
 * Information maturity and the user's must / prefer / optional priority are separate.
 */
export type Dimension = {
  id: string
  name: string
  question: string
  options: string
  output: string
  required: boolean
}

export const ownerDimensions: Dimension[] = [
  {
    id: 'O01',
    name: '使用者与生活习惯',
    question: '谁会经常使用这个空间？目前哪些日常操作最不方便？',
    options: '常用人数与使用场景；做饭、清洁或收纳习惯；自由补充；暂不确定。只记录与空间使用有关的信息。',
    output: '使用场景清单，以及每个场景希望改善的具体体验。',
    required: true,
  },
  {
    id: 'O02',
    name: '改造区域与目标',
    question: '本次要改哪些房间、哪些部位？每个区域最想解决什么问题？',
    options: '全屋或指定房间；墙、地、顶、固定柜体等部位多选；本次做／暂不做／待决定。',
    output: '按房间组织的改造范围、预期用途与排除项。',
    required: true,
  },
  {
    id: 'O03',
    name: '保留与改动边界',
    question: '哪些现有物品、位置或布局必须保留？哪些可以在解释原因后调整？',
    options: '保留原状／允许调整但需确认／计划更换／现场核实后决定；逐项填写对象。',
    output: '保留清单、允许改动的条件，以及改动前需要谁确认。',
    required: true,
  },
  {
    id: 'O04',
    name: '设备与功能需求',
    question: '有哪些现有或计划增加的固定设备？希望分别实现什么使用功能？',
    options: '现有／新增／仅预留／暂不需要；填写设备名称、已有型号或尺寸，未知处留待确认。',
    output: '设备及功能清单，关联安装位、供排水、电源等需要商家回应的配套问题。',
    required: true,
  },
  {
    id: 'O05',
    name: '空间位置与操作动线',
    question: '设备和操作区域希望放在哪里？需要保留哪些通行、开门或操作空间？',
    options: '在户型图标点／上传现状说明／用文字描述；尺寸分为已有依据与待实测，不填写推测值。',
    output: '点位意图、相邻关系与待测量清单；实际布置由商家结合现场资料确认。',
    required: true,
  },
  {
    id: 'O06',
    name: '材料外观与维护偏好',
    question: '材料更看重哪些使用感受？可以接受怎样的清洁、接缝和日常维护方式？',
    options: '易擦拭／耐用／减少接缝／指定外观／其他；允许排序或暂不确定，不自动锁定品牌。',
    output: '材料偏好及比较依据，要求商家解释各做法对使用和维护的影响。',
    required: false,
  },
  {
    id: 'O07',
    name: '重要程度与取舍',
    question: '哪些要求必须保留？如果两项要求无法同时实现，愿意优先满足哪一项？',
    options: '对每条需求单独选择必须／偏好／可选；冲突项选择保留、接受替代或暂缓决定。',
    output: '用户确认的优先级和取舍记录，与信息成熟度评分分别保存。',
    required: true,
  },
  {
    id: 'O08',
    name: '居住安排与时间约束',
    question: '施工期间是否继续居住？哪些空间不能同时停用？有没有需要协商的时间节点？',
    options: '继续居住／暂时搬出／未决定；不可停用区域；期望开始与交付时间，注明是否可调整。',
    output: '生活连续性要求、期望时间和需与商家核实的进场条件。',
    required: true,
  },
  {
    id: 'O09',
    name: '交付理解与确认方式',
    question: '需要商家提供哪些说明，才方便你理解方案并确认本次交付内容？',
    options: '逐项清单／材料说明／点位示意／改动对比／现场记录；选择确认人和沟通方式。',
    output: '用户期望的交付资料清单、方案确认方式和仍需解释的术语。',
    required: true,
  },
  {
    id: 'O10',
    name: '现场未知与待确认事项',
    question: '哪些信息还没有依据？需要谁补充什么资料，才能继续决定？',
    options: '待用户选择／待设备资料／待现场测量／待专业复核；指定补充人，允许明确暂缓。',
    output: '带责任方和影响范围的待办，未知项始终可见，不被计为已经满足。',
    required: true,
  },
]

export const merchantDimensions: Dimension[] = [
  {
    id: 'M01',
    name: '承接范围需要明确',
    question: '开始制作方案前，你需要业主确认哪些施工范围和排除项，才能准确回应需求？',
    options: '房间与部位／保留项／服务边界／需求版本；逐项选择已明确或需业主补充。',
    output: '商家开展方案工作的范围前提，以及需要业主回应的问题清单。',
    required: true,
  },
  {
    id: 'M02',
    name: '现场资料需要可靠',
    question: '判断布局和配套前，需要哪些现场信息？目前资料哪些可信、哪些必须再核实？',
    options: '户型与尺寸／设备资料／现有点位／现状照片；标记来源、核实状态和缺口。',
    output: '商家所需资料清单、可用依据及需测量的事项，避免按未经确认的假设承诺。',
    required: true,
  },
  {
    id: 'M03',
    name: '能力与专业边界需要对齐',
    question: '哪些工作可以自行承接？哪些需合作方或专业复核？哪些超出当前承接能力？',
    options: '可自行完成／需协作／需专业判断／无法承接；对具体工项说明依据和条件。',
    output: '商家的能力边界与协作诉求，无法承接不自动等同于用户需求不合理。',
    required: true,
  },
  {
    id: 'M04',
    name: '前置依赖需要协调',
    question: '开展本项工作前，需要业主、其他工种或设备方先完成什么？',
    options: '设备定型／点位确认／前序完工／场地可用／其他；列出依赖对象、负责人和完成条件。',
    output: '有先后关系的配套与协作清单，并说明前置条件未满足时影响哪些工作。',
    required: true,
  },
  {
    id: 'M05',
    name: '进场与工期条件需要确认',
    question: '安排人员和工序需要哪些进场条件？哪些时间安排需要业主配合或共同调整？',
    options: '进场时间／可施工时段／区域交接／现场存放／工序顺序；记录期望与已确认安排。',
    output: '可协商的实施安排、依赖条件和需双方确认的时间节点。',
    required: true,
  },
  {
    id: 'M06',
    name: '材料与设备供应需要落实',
    question: '哪些材料或设备需要提前确认？谁提供？型号或到货变化时需要什么决策？',
    options: '业主提供／商家提供／第三方提供／待确定；型号、到货依据、替代品需谁确认。',
    output: '供货责任、待确认材料设备及替代规则，不含报价或价格评价。',
    required: true,
  },
  {
    id: 'M07',
    name: '变更与确认责任需要稳定',
    question: '哪些人有权确认需求和方案？需求变化后，你需要怎样收到通知并重新回应？',
    options: '指定确认人；书面记录／平台确认；变更需说明范围、原因和受影响版本。',
    output: '确认权限与变更流程，确保商家依据同一需求版本继续工作。',
    required: true,
  },
  {
    id: 'M08',
    name: '交付与核对依据需要约定',
    question: '怎样说明本次交付边界？需要双方预先约定哪些资料和核对方式？',
    options: '工项清单／材料资料／点位示意／过程记录／待专业确认事项；标明提供方和确认人。',
    output: '双方认可的交付资料及核对流程；资料齐全不自动代表施工已经验收。',
    required: true,
  },
  {
    id: 'M09',
    name: '审查结果需要可解释可申诉',
    question: '收到审查意见时，需要看见哪些依据？若系统误判，应怎样补证或申请复核？',
    options: '关联需求／方案原文／具体缺口／下一步；补充证据、提出异议或请求人工复核。',
    output: '可追溯的问题与回应记录，保留商家说明及纠正前后的结论。',
    required: true,
  },
]

export const dimensionBridges: { owner: string; merchant: string; artifact: string }[] = [
  {
    owner: '改造区域与目标、保留与改动边界',
    merchant: '承接范围需要明确',
    artifact: '双方确认的范围清单，包含保留项、排除项和需求版本。',
  },
  {
    owner: '设备与功能需求、空间位置与操作动线',
    merchant: '现场资料需要可靠、前置依赖需要协调',
    artifact: '设备与点位清单，关联配套需求、资料来源和待测量事项。',
  },
  {
    owner: '材料外观与维护偏好',
    merchant: '材料与设备供应需要落实',
    artifact: '材料选择说明与供货责任表，保留用户偏好和替代品确认条件。',
  },
  {
    owner: '重要程度与取舍、现场未知与待确认事项',
    merchant: '能力与专业边界需要对齐、变更与确认责任需要稳定',
    artifact: '需求冲突、能力限制与未知事实分别记录的待办及版本变更单。',
  },
  {
    owner: '居住安排与时间约束',
    merchant: '进场与工期条件需要确认',
    artifact: '双方确认的进场安排、不可停用区域和受前置条件影响的时间节点。',
  },
  {
    owner: '交付理解与确认方式',
    merchant: '交付与核对依据需要约定、审查结果需要可解释可申诉',
    artifact: '可读的交付清单、原文证据、问题回应和用户确认记录。',
  },
]
