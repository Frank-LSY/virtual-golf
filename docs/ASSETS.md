# 素材与依赖来源

球场路线、高度场、地表色彩、树木、岩石、会所、旗杆、图标、标志、球场卡片与合成音效均为本项目原创。没有下载或引入外部模型、贴图、音乐或字体；中文使用设备自带字体。

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
