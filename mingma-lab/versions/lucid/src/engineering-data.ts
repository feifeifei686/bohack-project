export const engineeringLayers = [
  { id: 'structure', number: '01', name: '结构与拆改', short: '结构', color: '#756d5c', intro: '先看空间的骨架。', description: '楼板、外围墙体与内部隔墙共同定义房间和开口。这里沿用首页户型，展示基础结构关系。', parts: ['原结构楼板', '外围墙与室内隔墙', '门洞与空间边界'], checks: ['标明希望保留与调整的墙体', '由专业人员核实结构与开洞条件'] },
  { id: 'services', number: '02', name: '水电管线', short: '水电', color: '#437b87', intro: '把看不见的连接展开。', description: '用不同颜色区分强电、弱电、冷热水和排水，观察厨房、卫生间与生活区之间的连接。', parts: ['红色强电与金色弱电', '蓝色冷水与橙色热水', '浅色排水干支管'], checks: ['结合设备清单确认接口和点位', '记录试压、检测与隐蔽验收事项'] },
  { id: 'finishes', number: '03', name: '防水与铺装', short: '防水铺装', color: '#487c74', intro: '把地面做法与湿区分开看。', description: '浅蓝色表示湿区防水示意，木色与浅石色表示不同铺装区域，墙根翻边帮助理解地面与墙面的衔接。', parts: ['厨房与卫生间湿区', '墙根防水翻边', '地面铺装与分界'], checks: ['明确防水范围和验收方式', '核实基层、标高与收口关系'] },
  { id: 'ceiling', number: '04', name: '吊顶与木作', short: '吊顶木作', color: '#8d6f3e', intro: '打开饰面，看见背后的支撑。', description: '局部饰面打开后露出龙骨，灯带沿边缘布置。保留部分板面，方便对照基层与完成面。', parts: ['吊顶龙骨与支撑', '局部板材饰面', '嵌入式灯具与灯带'], checks: ['确认吊顶范围与检修位置', '协调照明、设备与基层接口'] },
  { id: 'fitted', number: '05', name: '柜体与固装', short: '柜体固装', color: '#816e55', intro: '让固定构件找到位置。', description: '从户型中分离橱柜、衣柜、浴室柜与门窗，观察它们如何沿墙布置，与空间和设备接口衔接。', parts: ['厨房橱柜与中岛', '衣柜、浴室柜与玄关柜', '门窗与固定收口'], checks: ['复核尺寸、开合和使用空间', '明确柜体与水电、墙地面的交界'] },
  { id: 'living', number: '06', name: '家具与居住', short: '居住效果', color: '#6d5e87', intro: '回到生活，查看完整的家。', description: '完整房屋保留家具、设备、灯具与绿植。把最终生活场景与下面各层对应起来，理解每项工程服务于什么需求。', parts: ['客厅与卧室家具', '厨房与卫浴设备', '照明、绿植与生活布置'], checks: ['核对活动动线和使用习惯', '把想保留或调整的内容写进需求'] },
] as const

export type EngineeringLayerId = typeof engineeringLayers[number]['id']
