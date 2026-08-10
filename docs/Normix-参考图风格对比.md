# Normix 参考图风格对比与迭代记录

## 参考图拆解

参考图为旅行业务 Dashboard，整体结构：

- 白色侧边栏：品牌、导航、底部升级提示。
- 顶部区域：页面标题、搜索、用户头像。
- 左侧主面板：深色销售数据图、底部预订列表。
- 右侧区域：多张浅色统计卡、日历和活动面板。

提取到的参考配色：

| 用途 | 色值 |
| --- | --- |
| 页面/卡片主色 | `#ffffff`、`#f6f7fb` |
| 深色数据面板 | `#15102c`、`#211942` |
| 主强调色 | `#6f7ce0` |
| 柔和青色 | `#7fd7e5` |
| 金色点缀 | `#d9a441` |
| 粉色点缀 | `#f2b8c4` |
| 文字 | `#1e2434`、`#7b8190` |

## 第一轮改造

- 将页面背景从偏蓝重渐变调整为白色/浅灰蓝。
- 侧边栏恢复白色，导航 active 态改为柔和蓝紫底色。
- 首页欢迎 Banner 改为深色数据面板，右侧用柱状数据图替代原 unDraw 插画。
- 作品库移除卡通摘要插画，恢复为干净的工具栏和筛选区。
- 空状态插画统一收敛为更克制的 `no-data_ig65.svg`。
- 统计卡、作品卡片、筛选栏、回收站表格统一使用白底、细边框、柔和阴影和参考配色。

## 第二轮评估

当前页面已向参考图靠拢：

- 白色主界面和浅色侧边栏已匹配。
- 深色数据面板、柔和蓝紫强调色已匹配。
- 插画不再占据主要视觉位置。
- 回收站空状态改为更克制的插图尺寸。

仍需继续观察：

- 首页数据面板的图表配色是否足够柔和。
- 作品库卡片的信息密度是否与参考图一致。
- 回收站空状态是否还需要进一步精简。

## 第二轮改造

- 首页继续保留深色数据面板，但把插画完全移除，改用数据柱状图和关键指标，更接近参考图的数据面板风格。
- 作品库移除了卡通摘要区，恢复成参考图的“顶部工具栏 + 内容列表”结构。
- 所有空状态统一改为更克制的 `no-data_ig65.svg`，避免不同页面出现风格混乱的插画。
- 回收站空状态增加轻量统计指标，使大面积的空状态更有 Dashboard 信息感。
- 侧边栏、统计卡、卡片列表统一采用参考图提取的柔和蓝紫、青色、金色点缀。

## 当前验收截图

- `output/playwright/reference-pass-home-final.jpg`
- `output/playwright/reference-pass-library-final.jpg`
- `output/playwright/reference-pass-trash-final.jpg`

## 自动验收

- `npm run lint`：通过
- `npm run build`：通过
- `npm run smoke`：通过
- `npm run acceptance`：通过

## 第三轮改造

- Banner 移除右侧趋势统计和图表，改为代码生成的动态流动效果：PPT、PDF、IMG 等素材块沿动态线流向中心“灵感”节点，体现作品持续沉淀为灵感。
- 回收站空状态移除统计卡片和卡片式装饰，改用透明 SVG 配图，不显示图片边缘轮廓。
- 统一主要卡片的圆角、边框、阴影和间距：白底、`12px` 圆角、`#e9edf4` 细边框、柔和阴影。
- 图表统一使用参考图风格的蓝紫、青色、金色、粉色点缀。

## 第三轮验收截图

- `output/playwright/flow-pass-home-final.jpg`
- `output/playwright/flow-pass-library-final.jpg`
- `output/playwright/flow-pass-trash-final.jpg`

## 第三轮自动验收

- `npm run lint`：通过
- `npm run build`：通过
- `npm run smoke`：通过
- `npm run acceptance`：通过

## 第四轮改造

- 回收站空状态配图替换为 `throw-away_aaho.svg`，主题更贴近垃圾桶，插画为透明 SVG，无边缘轮廓和卡片装饰。
- 首页 Banner 移除旧的卡片式流动动画，改为纯 Canvas 代码动画。
- 代码动画完全由字母和数字组成，包含持续下落的字符流。
- 代码动画支持交互：鼠标移动会加速附近字符并产生字符粒子，点击会触发字符迸发效果。

## 第四轮验收截图

- `output/playwright/code-rain-home-final.jpg`
- `output/playwright/code-rain-library-final.jpg`
- `output/playwright/code-rain-trash-final.jpg`

## 第四轮自动验收

- `npm run lint`：通过
- `npm run build`：通过
- `npm run smoke`：通过
- `npm run acceptance`：通过

## 第五轮改造

- 首页代码动画改为更细密、更密集的字母数字流。
- 动画增加 MG 叙事循环：代码字符先汇聚成 `PPT`，再流动汇聚为 `灵感`、`知识`，最后形成 `NORMIX`，循环演绎“作品进入平台并沉淀为知识”的过程。
- 保留鼠标交互：靠近字符流会加速并产生字符粒子，点击会触发字符迸发。
- 回收站空状态使用垃圾桶主题透明 SVG，不展示卡片或边缘轮廓。

## 第五轮验收截图

- `output/playwright/mg-animation-home-final.jpg`
- `output/playwright/mg-animation-trash-final.jpg`

## 第五轮自动验收

- `npm run lint`：通过
- `npm run build`：通过
- `npm run smoke`：通过
- `npm run acceptance`：通过

## 第六轮改造

- 首页代码动画的第一阶段从“PPT 文字”改为“立体 PPT 图标”。
- 立体 PPT 图标由代码字符粒子构成：包含前脸、顶面、右面、播放三角和面内字符网格。
- 图标完成后再由代码粒子流向 `灵感`、`知识`、`NORMIX`，继续表达作品进入平台并沉淀为知识的过程。
- 字符仍然保持更小、更密集，并保留鼠标靠近加速和点击迸发交互。

## 第六轮验收截图

- `output/playwright/ppt-icon-animation-final.jpg`

## 第六轮自动验收

- `npm run lint`：通过
- `npm run build`：通过
- `npm run smoke`：通过
- `npm run acceptance`：通过

## 第七轮改造

- PPT 图标改为使用用户提供的精确 SVG 图标轮廓生成代码粒子目标点。
- 动画不再从随机位置剧烈汇聚，而是让代码字符从上方一点一点落下，柔和地落到图标对应位置。
- 粒子移动改为低速度、低透明度、无强光晕、无连线闪烁，整体更克制、更柔和。
- 点击和鼠标悬浮的粒子反馈也降低频率与数量，避免过度夸张。

## 第七轮验收截图

- `output/playwright/ppt-soft-fall-final.jpg`

## 第七轮自动验收

- `npm run lint`：通过
- `npm run build`：通过
- `npm run smoke`：通过
- `npm run acceptance`：通过

## 第八轮改造：导演 + 工程师协作

导演定叙事：

1. 代码字符从上方安静落下，按目标点位一点一点拼出精确的 PPT 图标。
2. 图标完成后轻微呼吸，并在下方出现 `NORMIX` 平台标识。
3. 整个画面缓慢淡出，再重新开始，形成循环。

工程师定实现：

- 新增 `src/PlatformCodeAnimation.tsx`，独立管理动画场景、粒子目标点、缓动节奏和交互。
- 粒子不再随机乱飞，而是从顶部固定起点，用 `easeOutCubic` 平滑移动到 PPT 图标目标点。
- 图标路径使用用户提供的 SVG 精确轮廓生成目标点。
- 背景代码雨降低速度、字号和透明度，避免抢主视觉。
- 移除了强光晕、连线闪烁和夸张迸发，只保留克制的鼠标交互。

## 第八轮验收截图

- `output/playwright/platform-mg-clear-final.jpg`

## 第八轮自动验收

- `npm run lint`：通过
- `npm run build`：通过
- `npm run smoke`：通过
- `npm run acceptance`：通过

## 第九轮改造：用户视角评价

用户评价：

- 当前动画仍然看起来像随机字符乱飘。
- PPT 图标轮廓不够清楚。
- 需要更像“代码一笔一笔落下，把图标描出来”的动画。

本轮实现：

- 使用 SVG 路径采样替代随机像素散点。
- 代码字符按 PPT 图标路径顺序一点一点落下，沿轮廓逐段描出图标。
- 图标不再用随机字符填满内部，而是保留清晰轮廓和内部关键结构。
- 背景代码雨继续保持低透明、低速度，不干扰主视觉。

## 第九轮验收截图

- `output/playwright/path-trace-ppt-final.jpg`

## 第九轮自动验收

- `npm run lint`：通过
- `npm run build`：通过
- `npm run smoke`：通过
- `npm run acceptance`：通过

## 第十轮改造：彩色代码横向流动

参考图视觉：

- 深蓝/藏青背景。
- 蓝色、青色代码字符从左往右流动。
- 视觉重点是流动方向、颜色层次和代码质感。

本轮实现：

- 代码动画背景改为横向流动：字符从左往右持续移动，不再从上方下落。
- 代码字符加入参考图风格的蓝色、青色、浅蓝、薄荷色层次。
- 动画主视觉循环展示多个办公相关图标：PPT、文档、表格、文件夹、演示、图表、知识。
- 每个图标仍然由代码字符按 SVG 路径一笔一笔描出。
- 图标完成后轻微呼吸，再平滑过渡到下一个办公图标。

## 第十轮验收截图

- `output/playwright/office-code-flow-final.jpg`

## 第十轮自动验收

- `npm run lint`：通过
- `npm run build`：通过
- `npm run smoke`：通过
- `npm run acceptance`：通过

## 第十一轮改造：代码构成插画

用户反馈：

- 不需要图标色块。
- 希望代码数量更多、更密集。
- 希望代码像流动过去后停留成一幅插画。
- 动画要更柔和、更高级。

本轮实现：

- 移除图标背景色块和所有描边色块，只保留代码字符本身。
- 办公图标改为纯线条插画，由更密集的代码字符一笔一笔构成。
- 插画序列改为：演示、文档、表格、文件夹、图表、知识、灵感。
- 代码从左侧柔和流入，按 SVG 路径顺序停留在目标位置，形成插画轮廓。
- 背景代码横向流动继续保持蓝色、青色、浅蓝和薄荷色层次。

## 第十一轮验收截图

- `output/playwright/code-illustration-flow-final.jpg`

## 第十一轮自动验收

- `npm run lint`：通过
- `npm run build`：通过
- `npm run smoke`：通过
- `npm run acceptance`：通过

## 第十二轮改造：静态 Banner 配图

- Banner 移除代码动画，改为使用用户提供的静态配图。
- 左侧蒙版调整为深蓝色，并向右自然过渡到透明。
- 文字区域保持高对比度，不影响可读性。
- 新增验收截图：`output/playwright/static-banner-deepblue-final.jpg`

## 第十三轮改造：Banner 光影与标题流光

- Banner 增加两道柔和光影，从左往右循环流动。
- 主标题字号放大。
- 主标题使用渐变色文字，并加入缓慢流光动画。
- 光影位于图片上方、文字下方，不影响可读性。
- 新增验收截图：`output/playwright/banner-light-shine-final.jpg`

## 第十四轮改造：标题单行与高级流光

- 主标题强制单行，不换行。
- 流光渐变色改为更克制的银白、浅冰蓝、暖白层次，移除偏青蓝的配色。
- 光影和粒子调整为更柔和的银白色，降低色彩饱和度。
- 新增验收截图：`output/playwright/banner-silver-shine-final.jpg`

## 第十五轮改造：文件夹空状态

- 文件夹空状态改用文件夹相关插画，不再使用通用空数据图。
- 空状态改为左侧插画、右侧文案和导入按钮的排版。
- 无筛选结果时保留同一排版，但切换为搜索空结果插画。
- 新增验收截图：`output/playwright/folder-empty-final.jpg`
