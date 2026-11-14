import type { PreferenceDraft, PreferenceQuestion, PreferenceOption } from './intake-preferences.ts'

type Item = [id: string, label: string]
const unknown: PreferenceOption = { id: 'unknown', label: '暂不确定', detail: '先留待确认，之后可以回来补充' }
const ask = (id: string, title: string, items: Item[], multiple = false, hint = ''): PreferenceQuestion => ({ id, title, multiple, options: [...items.map(([id, label]) => ({ id, label })), unknown], hint: hint || (multiple ? '可多选，只选择符合自己情况的部分。' : '选择最接近实际情况的一项。') })
const has = (draft: PreferenceDraft, id: string, ...values: string[]) => values.some(value => draft.answers[id]?.includes(value))

const scenes: Record<string, Item[]> = {
  bathroom: [['morning', '早晚集中洗漱'], ['shower', '每天淋浴'], ['bath', '泡澡放松'], ['care', '帮孩子或长辈洗漱'], ['makeup', '护肤与化妆']],
  kitchen: [['daily', '每天做正餐'], ['simple', '简单加热或轻食'], ['baking', '烘焙、蒸烤'], ['together', '两人一起做饭'], ['hosting', '经常为亲友做饭']],
  bedroom: [['sleep', '睡觉休息'], ['read', '睡前阅读'], ['dress', '换衣、梳妆'], ['work', '偶尔办公'], ['care', '照看孩子或长辈']],
  living: [['tv', '看电视、追剧'], ['guests', '接待亲友'], ['play', '孩子玩耍'], ['exercise', '居家运动'], ['work', '临时办公或学习']],
  dining: [['daily', '日常家庭用餐'], ['guests', '亲友聚餐'], ['work', '餐桌兼做书桌'], ['prep', '备餐或做手工']],
  entry: [['shoes', '换鞋、放鞋'], ['coats', '挂外套与包'], ['parcel', '暂放快递'], ['wheels', '停婴儿车或助行器'], ['pets', '宠物出入清洁']],
  balcony: [['laundry', '洗衣晾晒'], ['plants', '养花种草'], ['leisure', '休闲喝茶'], ['exercise', '简单运动'], ['housework', '家务与清洁工具存放']],
  study: [['work', '长时间办公'], ['study', '学习阅读'], ['video', '视频会议'], ['hobby', '手工或兴趣活动'], ['shared', '多人共用']],
  general: [['daily', '日常起居'], ['guests', '亲友来访'], ['care', '家人照护'], ['work', '居家办公'], ['pets', '与宠物共同生活']],
}
const pains: Record<string, Item[]> = {
  bathroom: [['wet', '洗澡后到处是水'], ['crowded', '洗漱时互相挡路'], ['clean', '接缝与角落难清理'], ['damp', '潮湿或有异味'], ['storage', '洗漱用品没地方放']],
  kitchen: [['counter', '备菜台面不够'], ['workflow', '洗切炒来回走'], ['smoke', '油烟或闷热'], ['clean', '油污和角落难清洁'], ['storage', '锅具调料不好找']],
  bedroom: [['noise', '声音影响睡眠'], ['light', '光线影响休息'], ['storage', '衣物堆放杂乱'], ['switch', '开灯或充电不方便'], ['passage', '床边通行不顺']],
  living: [['passage', '家具挡路'], ['storage', '杂物无处安放'], ['glare', '看屏幕时有反光'], ['socket', '插座与线缆不方便'], ['shared', '家人活动互相打扰']],
  dining: [['passage', '拉椅子或经过不方便'], ['capacity', '来客时坐不下'], ['storage', '餐具和小家电不好放'], ['clean', '桌边地面容易脏']],
  entry: [['shoes', '鞋子堆在门口'], ['seat', '换鞋费力'], ['dark', '进门光线暗'], ['door', '柜门与入户门冲突'], ['dirty', '灰尘和雨水带进家']],
  balcony: [['dry', '衣服不易晾干'], ['mixed', '家务和休闲互相占用'], ['storage', '工具杂物堆放'], ['water', '雨水或积水问题']],
  study: [['noise', '容易被声音打扰'], ['light', '屏幕反光或阅读费眼'], ['desk', '桌面拥挤'], ['wires', '设备线缆杂乱'], ['shared', '共用时互相影响']],
  general: [['passage', '空间衔接或通行不顺'], ['storage', '东西无处收纳'], ['clean', '日常清洁费力'], ['lighting', '照明与插座不方便'], ['none', '目前没有明显不便']],
}
const storageItems: Record<string, Item[]> = {
  bathroom: [['daily', '每天用的洗漱护肤品'], ['stock', '囤货与替换用品'], ['towel', '毛巾、换洗衣物'], ['cleaning', '清洁用品']],
  kitchen: [['pots', '锅具与餐具'], ['seasoning', '调料与干货'], ['appliances', '小家电'], ['stock', '囤货与大包装']],
  bedroom: [['hanging', '长衣、外套等挂放衣物'], ['folded', '叠放衣物'], ['bedding', '被褥与换季物品'], ['daily', '床边随手物品']],
  living: [['daily', '日常随手物品'], ['books', '书籍与收藏'], ['toys', '孩子的玩具'], ['devices', '影音与游戏设备']],
  dining: [['dishes', '餐具与杯子'], ['appliances', '咖啡机等小家电'], ['stock', '零食与囤货'], ['display', '酒具或展示物品']],
  entry: [['shoes', '常穿鞋'], ['seasonal', '换季鞋与靴子'], ['coats', '外套、雨具与包'], ['wheels', '行李箱或推车']],
  balcony: [['cleaning', '清洁工具'], ['laundry', '洗衣用品'], ['plants', '园艺用品'], ['stock', '不常用的大件']],
  study: [['books', '书籍资料'], ['devices', '电脑与设备'], ['supplies', '文具与耗材'], ['hobby', '兴趣用品']],
  general: [['daily', '常用小物'], ['seasonal', '换季物品'], ['large', '大件用品'], ['stock', '囤货']],
}

export function lifestyleQuestions(kind: string): PreferenceQuestion[] {
  return [ask('usage', '你通常会在这里做哪些事？', scenes[kind] || scenes.general, true),
    ask('pain', '现在最让你不方便的是什么？', [...(pains[kind] || pains.general).filter(([id]) => id !== 'none'), ['none', '目前没有明显不便']], true, '描述实际不便即可，不需要判断技术原因。')]
}

export function deepPreferenceQuestions(kind: string, draft: PreferenceDraft): PreferenceQuestion[] {
  const qs: PreferenceQuestion[] = []
  const goal = (...ids: string[]) => has(draft, 'goals', ...ids)
  if (has(draft, 'users', 'child', 'senior', 'mobility')) {
    qs.push(ask('accessibility', '家人使用时，哪些便利最需要考虑？', [['passage', '通道顺畅、少障碍'], ['reach', '常用物品容易拿到'], ['night', '夜间起身容易看清'], ['seated', '可以坐着完成操作'], ['none', '暂时没有特别需要']], true))
    if (has(draft, 'accessibility', 'night')) qs.push(ask('night-light', '夜间照明，你更倾向怎样操作？', [['sensor', '经过时自动亮起'], ['bedside', '手边有开关'], ['soft', '保留柔和常亮灯'], ['compare', '请提供几种方式比较']]))
  }
  if (goal('floor')) {
    qs.push(ask('floor-usage', '地面需要适应哪些日常使用方式？', [['barefoot', '经常光脚走'], ['play', '坐在地上或陪孩子玩'], ['chair', '经常移动桌椅'], ['pet', '宠物活动'], ['wet', '经常接触水']], true))
    qs.push(ask('floor-material', '地面外观与材料，你目前更倾向哪种？', [['wood-look', '木纹、温暖的感觉'], ['tile-look', '瓷砖或石材的感觉'], ['continuous', '简洁、连续的表面'], ['keep-look', '和现有地面协调'], ['samples', '先看样品再决定']], false, '只记录倾向；适用空间、维护方式与材料性能需要再核对。'))
    if (has(draft, 'floor-cleaning', '4', '5')) qs.push(ask('cleaning-trouble', '清洁时，你最希望少做哪些事？', [['seams', '刷洗接缝与角落'], ['stains', '处理水渍或油污'], ['dust', '清理毛发与灰尘'], ['care', '定期打蜡或特殊养护']], true))
    if (has(draft, 'users', 'pet') || has(draft, 'floor-usage', 'pet', 'chair')) qs.push(ask('floor-wear', '磨损和划痕出现时，你更能接受哪种取舍？', [['durable', '更重视耐磨，外观可以调整'], ['look', '更重视外观，愿意多做保护'], ['repair', '希望局部容易修补或更换']], false, '不据此直接确定材料，后续需要比较样品与维护要求。'))
  }
  if (goal('storage')) {
    qs.push(ask('storage-items', '最需要收进去的是哪些东西？', storageItems[kind] || storageItems.general, true))
    qs.push(ask('storage-problem', '目前的收纳，主要卡在哪里？', [['capacity', '总容量不够'], ['reach', '有空间但不容易拿'], ['sort', '分类不清，经常找不到'], ['dust', '露在外面容易积灰'], ['size', '大件或异形物品放不下']], true))
    qs.push(ask('storage-access', '你希望常用物品怎样取放？', [['closed', '尽量藏起来，视觉整洁'], ['open', '随手能拿到，少开柜门'], ['mixed', '常用的开放，其余封闭']], false, '常用与低频物品可以采用不同方式。'))
    if (has(draft, 'storage-items', 'hanging', 'folded', 'bedding')) qs.push(ask('wardrobe', '衣物收纳希望怎样分配？', [['hang', '多留挂衣空间'], ['fold', '多留叠放与抽屉'], ['seasonal', '重视换季和被褥空间'], ['separate', '家人的衣物分开管理']], true))
    if (has(draft, 'storage-items', 'appliances', 'devices')) qs.push(ask('storage-power', '收纳的电器或设备通常怎样使用？', [['in-place', '希望原位使用或充电'], ['move', '取出后再使用'], ['mixed', '按设备分别安排']], false, '这里只收集使用习惯；散热、插座与安装条件需逐项核对。'))
  }
  if (goal('lighting')) {
    qs.push(ask('lighting-scenes', '哪些时候的灯光最需要改善？', [['task', '洗漱、阅读或操作时'], ['relax', '休息放松时'], ['night', '半夜经过或起身时'], ['clean', '打扫整理时']], true))
    qs.push(ask('lighting-control', '你希望怎样控制灯光？', [['switch', '简单的墙面开关'], ['nearby', '床边或常坐位置也能控制'], ['dimming', '能够调整亮度'], ['sensor', '部分位置自动感应']], true))
    qs.push(ask('power-use', '哪些设备希望有方便的用电位置？', [['phone', '手机、平板充电'], ['cleaner', '吸尘器或清洁设备'], ['appliance', '常用小电器'], ['desk', '电脑、显示器等设备'], ['none', '现有位置基本够用']], true, '先明确设备与使用位置，不要求你估算线路或插座规格。'))
    if (kind === 'bathroom') qs.push(ask('bath-ventilation', '通风与潮湿方面，你希望优先改善什么？', [['dry', '洗澡后更快干燥'], ['smell', '减少异味'], ['quiet', '换气时更安静'], ['none', '目前没有明显问题']], true))
  }
  if (goal('layout', 'wall')) {
    qs.push(ask('layout-trouble', '空间布置最需要为哪件事让出位置？', [['passage', '日常通行'], ['family', '家人一起活动'], ['guests', '来客时有位置'], ['work', '办公或学习'], ['large', '保留较大的家具']], true))
    qs.push(ask('layout-change', '对于调整布局，你目前的接受程度是？', [['furniture', '先调整家具位置'], ['fixed', '可以比较柜体和固定设施的调整'], ['partition', '希望了解隔墙调整的可能性'], ['keep', '尽量保持原有布局']], false, '选择隔墙调整只代表咨询意向，墙体性质与可改范围仍需专业核实。'))
  }
  if (goal('quiet')) {
    qs.push(ask('noise-source', '通常是什么声音让你分心或休息不好？', [['outside', '窗外交通或人声'], ['next-room', '相邻房间活动'], ['upstairs', '楼上或公共区域'], ['equipment', '设备运行'], ['unknown-source', '听得到，但不清楚来源']], true))
    qs.push(ask('quiet-time', '你最需要安静的是哪些时段？', [['night', '夜间睡觉'], ['nap', '白天午休'], ['focus', '工作或学习时'], ['meeting', '线上会议时']], true))
    if (has(draft, 'usage', 'read', 'sleep') || kind === 'bedroom') qs.push(ask('sleep-light', '休息时，你对光线更偏向哪种？', [['dark', '尽量遮光'], ['soft', '有少量柔和光线'], ['daylight', '保留自然晨光'], ['separate', '不同使用者可以分别调节']]))
  }
  if (kind === 'bathroom' && goal('shower')) {
    qs.push(ask('shower-habit', '淋浴时最在意哪些体验？', [['splash', '水不要溅到外面'], ['move', '转身和拿东西方便'], ['clean', '洗完容易清理'], ['help', '需要方便照护家人']], true))
    if (has(draft, 'shower', 'screen', 'separate')) qs.push(ask('shower-screen', '有隔断时，什么最影响你的选择？', [['entry', '出入方便、少障碍'], ['clean', '玻璃和轨道容易清洁'], ['space', '尽量不占通行空间'], ['privacy', '需要一定遮挡和隐私']], true))
    qs.push(ask('bath-sharing', '家人会不会同时使用卫生间？', [['one', '通常一个人使用'], ['together', '希望洗漱和淋浴可以同时进行'], ['rush', '早晚经常需要排队'], ['care', '有时需要两人一起照护']]))
  }
  if (kind === 'kitchen' && goal('counter', 'appliance')) {
    qs.push(ask('cooking-workflow', '做饭时，哪一段操作最需要改善？', [['wash-prep', '清洗到备菜的衔接'], ['prep-cook', '备菜到烹饪的衔接'], ['serve', '出餐、端菜方便'], ['cleanup', '饭后收拾与清洗']], true))
    qs.push(ask('counter-space', '台面最需要留给什么？', [['prep', '连续备菜空间'], ['appliances', '常用小家电'], ['baking', '烘焙或面点操作'], ['two', '两人同时操作']], true))
    if (has(draft, 'appliance', 'dishwasher')) qs.push(ask('dishwasher-use', '洗碗机主要希望帮你解决什么？', [['daily', '每天的碗碟清洗'], ['pots', '锅具等大件清洗'], ['hosting', '来客后的集中清洗'], ['less-work', '尽量减少手洗和收拾']], true))
    if (has(draft, 'appliance', 'oven')) qs.push(ask('oven-use', '蒸烤设备更常用来做什么？', [['heat', '加热与简单蒸煮'], ['baking', '烘焙糕点'], ['meals', '制作正餐'], ['learn', '想尝试，目前用得少']], true))
  }
  if (goal('seat')) qs.push(ask('entry-seat', '换鞋时，你希望怎样坐？', [['fixed', '有固定换鞋凳'], ['combined', '与鞋柜结合'], ['movable', '可以挪动的小凳'], ['space', '先比较不占通道的方案']]))
  if (goal('laundry')) {
    qs.push(ask('laundry-method', '衣物洗完后主要怎样处理？', [['hang', '自然晾晒'], ['dryer', '以烘干为主'], ['both', '晾晒与烘干结合']], false, '设备、排水与空间条件需后续核对。'))
    qs.push(ask('laundry-task', '哪些家务希望能在这里顺手完成？', [['sort', '脏衣分类'], ['handwash', '少量手洗'], ['fold', '折叠和临时放衣物'], ['clean', '清洗与存放清洁工具']], true))
  }
  if (goal('leisure')) qs.push(ask('balcony-leisure', '阳台休闲更希望满足哪种活动？', [['sit', '坐着喝茶、看书'], ['plants', '照料植物'], ['exercise', '伸展或简单运动'], ['family', '家人一起小坐']], true))
  if (has(draft, 'usage', 'work', 'video', 'study') && ['bedroom', 'living', 'study', 'dining'].includes(kind)) qs.push(ask('work-setup', '在家工作或学习时，需要怎样的配置？', [['temporary', '临时使用即可'], ['fixed', '希望有固定位置'], ['screens', '需要多个屏幕或设备'], ['private', '需要较少打扰的角落']], true))
  return qs
}

export function boundaryQuestions(draft: PreferenceDraft, goals: PreferenceOption[]): PreferenceQuestion[] {
  const activeGoals = goals.filter(o => o.id !== 'unknown' && draft.answers.goals?.includes(o.id))
  const qs = [ask('priority', '如果不能一次兼顾，你最想先解决哪一项？', activeGoals.length ? [...activeGoals.map(o => [o.id, o.label] as Item), ['balanced', '希望兼顾，先比较方案']] : [['convenience', '日常使用方便'], ['maintenance', '好清洁、少维护'], ['comfort', '舒适感'], ['keep', '尽量保留现有部分']]),
    ask('tradeoff', '方案里有哪些情况是你不太能接受的？', [['crowded', '通道或活动空间变窄'], ['maintenance', '需要频繁清洁和养护'], ['loss', '现有收纳明显减少'], ['complex', '操作步骤变复杂'], ['fixed', '后续调整或维修困难'], ['none', '暂时没有特别限制']], true)]
  if ((draft.answers.retention || []).some(v => !['none', 'unknown'].includes(v))) qs.unshift(ask('retention-boundary', '对于想保留的部分，你希望保留到什么程度？', [['original', '外观和位置都尽量不动'], ['repair', '可以修补、换五金等小调整'], ['function', '功能保留，形式可以商量'], ['evaluate', '先评估现状，再决定是否保留']]))
  return qs
}
