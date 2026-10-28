# 素材与依赖来源

球场路线、高度场、地表色彩、树木、岩石、会所、旗杆、图标、标志、球场卡片与合成音效均为本项目原创。未引入外部品牌模型或字体；0.10.1 加入用户提供的背景音乐，来源见下文；0.19.0 新增的大厅与练习室配乐为原创实时合成。中文使用设备自带字体。0.7.0 新增一张使用内置 image_gen 工具生成的原创球杆材质图集，详见下方。

| 依赖 | 用途 | 许可证 | 官方来源 |
| --- | --- | --- | --- |
| Three.js | 三维渲染 | MIT | https://github.com/mrdoob/three.js |
| ws | 本地 WebSocket 通信 | MIT | https://github.com/websockets/ws |
| qrcode | 本地二维码生成 | MIT | https://github.com/soldair/node-qrcode |
| Node.js 22.23.4 | Mac 包的运行环境 | MIT 及随附第三方许可 | https://nodejs.org/dist/v22.23.4/ |

依赖的精确版本锁定在 package-lock.json。第三方许可证保留原文，位于各自软件包内；Node.js 的完整许可位于 Mac 包的 runtime/LICENSE.txt，其下载来源和校验值位于 runtime/来源与校验.json。

技术方案中列举的参考游戏和模型包未被复制或引入。场景装饰使用确定性种子生成。本地证书、私钥、配对令牌和用户存档不会进入 Mac 发布包。

0.4.0 新增原创程序化球手、三套配色装扮、帽子、手套、球杆关节动画、训练场山峦和云朵。交互与视角参考 [Nintendo Switch Sports 官方高尔夫指南](https://www.nintendo.com/jp/topics/article/9183c639-08d7-4520-a444-26f9b0bce889) 中的试挥、力量条与地图标记；没有复制任天堂人物、截图、模型、贴图、音效或标志。

0.6.0 增加原创暮光配色、手机动作示意与引导校准界面。校准交互研究参考 [Nintendo 官方操作指南](https://www.nintendo.com/jp/ichikara/as8sa/index_en.html)，吸收握姿重置、试挥与力度预判原则，未使用其图片、人物或代码。


## 0.7.0 原创球杆材质

- 保存位置：`screen-web/assets/club-material-atlas.png`，1536 × 1024，3 列 × 2 行。
- 生成方式：内置 `image_gen.imagegen` 工具，未使用 API / CLI 后备模式；2026-10-27 生成。图像原样复制到项目，未用脚本裁剪或重绘；三维模型通过纹理坐标选择对应单元。
- 第一行：一号木杆碳纤维、铁杆拉丝精钢、挖起杆香槟镍面；第二行：沙坑杆铜色喷砂、劈起杆枪灰金属、推杆哑黑与白色瞄准线。
- 杆头、握把、杆身、沟槽、人物关节、球车、车轮和球包均为原创程序化网格。球车未使用任何厂商标志。彩虹拖尾由三维网格和顶点颜色构成。

最终生成提示词（原文）：

> Create ONE game-ready golf club material texture atlas, 1536x1024 landscape, exactly a perfectly aligned 3-column by 2-row grid of equal rectangular tiles, zero gaps, zero borders, zero labels or text or logos. Each tile is a flat orthographic full-bleed macro material/albedo texture, not a photograph of a club, no objects, no cast shadows, no perspective, neutral even lighting. TOP LEFT: dense fine dark graphite black diagonal woven carbon fiber, subtle satin highlights, for a driver crown. TOP MIDDLE: clean cool silver horizontal finely brushed stainless steel for an iron head. TOP RIGHT: pale warm champagne satin nickel with tiny uniform milling grain for a wedge. BOTTOM LEFT: muted copper bronze shot-peened metal, extremely fine tactile grain, for a sand wedge. BOTTOM MIDDLE: dark blue-gray gunmetal finely brushed titanium, for a chipping club. BOTTOM RIGHT: charcoal black matte anodized metal, with a single thin straight ivory alignment stripe vertically through the center of this tile only, for a putter. Materials should be refined, physically plausible, pleasantly readable in a stylized 3D golf game, with detailed subtle microtexture rather than large patterns. Tiles must precisely occupy their one-third width and one-half height, perfectly regular grid without dividers. Texture atlas only.


0.8.0 的共用树木凸面模型、木屑/碎叶、水花粒子、涟漪和水面波纹均由本项目程序生成；碰撞音效由浏览器 Web Audio 合成，无新增外部贴图或音频素材。

0.9.0 的沙粒、扬尘、草叶、沙纹、草丛、局部陷球地面和音效均由程序生成，未新增外部图片、模型或音频素材。


0.10.0 果岭剪草纹理、坡度网格、流动箭头、洞缘光点、杯底触碰音均为程序生成。

## 0.11.0 背景音乐与球场环境音

- 曲目：Brian Crain — Butterfly Waltz。
- 来源：用户于 2026-10-27 更新工程根目录的 M500000ZTbBw1kLND4.mp3，并明确要求替换。ID3 标题为 Butterfly Waltz，艺术家为 Brian Crain，专辑为 A Simple Life；本次未从外部网站下载或购买。
- 文件：screen-web/assets/music/butterfly-waltz.mp3；3,330,970 字节。仅移动并规范文件名，未转码。
- SHA-256：8fd05ee7a7394f9fa57f0132bbf53832ec676062b9879c24c3cab41dd7f262e3。
- 原文件的下载来源、录音版本及授权条款未由项目核验，不将文件标注为原创或开放许可素材。
- 音频随本地工程和两种 Mac 启动包一并保存。旧版音频备份在 .local/music-backups，不进入发行包。
- 风声由滤波噪声合成，鸟鸣由短促变频波形与立体声声像合成，均在 screen-web/soundscape.js 中生成，无外部自然录音素材。

## 0.19.0 原创生成背景音乐

- 大厅《晴空》与练习室《节拍》为本项目原创，由 screen-web/lofi-music.js 在浏览器中实时合成：和弦、旋律、贝斯与鼓点由作曲程序按随机种子生成，音色全部来自 Web Audio 振荡器与噪声（调频电钢琴、加法钢琴、马林巴、钟琴、合成贝斯、合成鼓、黑胶底噪、程序生成混响）。
- 不包含任何录音、采样或外部曲目，也不下载音频文件；发行包体积不变。
- 曾检索开放许可的 Lo-Fi 曲库（OpenGameArt、Free Stock Music 上的 Kevin MacLeod 曲目、Wikimedia Commons），但当前环境无法下载音频文件，因此改为原创生成。
- 响度按 EBU R128 校准：在默认音量下与 Butterfly Waltz 接近（离线渲染测得《晴空》约 -16 LUFS、《节拍》约 -17.5 LUFS，原曲约 -15.6 LUFS）。

## 0.12.0 原创环境贴图与空间音效

使用内置 image_gen 工具创建四张素材，未复制任天堂或其他游戏素材。完整提示词见 [ENVIRONMENT-PROMPTS.md](ENVIRONMENT-PROMPTS.md)。工作原图备份在 .local/environment-masters，发布版仅包含以下 WebP；仅缩放和压缩，保留云朵及草簇透明通道。

| 文件（screen-web/assets/environment/） | 尺寸 | 传输大小 | 用途 |
| --- | --- | --- | --- |
| course-atlas-v1.webp | 1536 × 768 | 458,074 字节 | 四列两行：球道、果岭、长草、沙地／树皮、阔叶、松针、水面 |
| sky-v1.webp | 1536 × 768 | 18,232 字节 | 全天空背景，柔和高云与地平线渐变 |
| cloud-v1.webp | 768 × 512 | 55,928 字节 | 透明积云，七组实例共用一个纹理 |
| rough-clumps-v1.webp | 1024 × 342 | 173,318 字节 | 四列长草草簇，透明叶片与随机变体 |

总计 705,552 字节（约 689 KiB）。文件哈希记录在该目录的 manifest.json；图集和天空使用 WebP 品质 86／82，云朵品质 82、透明度品质 92，草簇品质 84、透明度品质 90。文件名带版本号，更新素材时必须递增版本，避免永久缓存旧文件。镜头光照、水面反光、纹理凹凸和距离淡出由程序实现。

田径跑道、看台、雨棚、灯杆、分道线、随机树冠几何，以及高尔夫球细纹与瞄准线均由项目代码生成。球皮采用共用 512 × 256 纹理，无额外图片下载。

木杆、铁杆、各类短杆、推杆、地形接触、树木、水花与洞杯声音全部由 Web Audio 合成，不增加下载音效文件。背景音乐来源沿用上节用户提供的文件。


### 0.13.0 九洞地图

新增地图、路线图、远景和接驳道路均由项目代码生成。外部球场图只供设计研究，不随应用分发；资料链接及抽象方式见 COURSE-DESIGN.md。本版无新增外部媒体下载依赖。
