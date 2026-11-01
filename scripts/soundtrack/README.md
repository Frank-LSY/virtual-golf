# 配乐生成程序

体感派对的全部背景音乐由这里的程序写出并渲染：一首主题、十一段循环变奏、两段短曲，以及每段循环配的“进场”过门。

- `score.py`：主题旋律（音级 + 八分音符时值，16 小节 A / A' / B / A''）、和声进行与调式 / 摇摆 / 人性化处理。
- `parts.py`：伴奏型（拨弦 oom-pah、圆舞曲伴奏、竖琴琶音、十六分音符发条音型、行走低音、导音线对位、定音鼓滚奏、竖琴刮奏、打击乐）。
- `variants.py`：各段曲目的编曲（`CUES`）。每段循环还返回乐段起点（`sections`）和过门风格（`lead`）；《星海加时》另有 `layers`（紧张层声部）。`lead_in()` 按曲目的调与速度写出过门：2 拍引子（3/4 曲子是 1 小节）+ 落在第一拍上的重音，风格分轻柔 / 明亮 / 史诗。
- `engine.py`：FluidSynth 渲染、声像、均衡、混响、压缩、限幅。
- `build.py`：渲染并写出 `screen-web/assets/music/*.mp3` 与 `soundtrack.json`（含拍数、每小节拍数、乐段、过门、叠层信息）。叠层与主轨共用同一个响度增益，相加不超过满刻度。

需要：Python 3、numpy、scipy、ffmpeg（含 libmp3lame）和 libfluidsynth；音色库默认 `/usr/share/sounds/sf2/TimGM6mb.sf2`，可用环境变量 `SWINGLINK_SF2` 换成别的 .sf2。

```sh
python3 scripts/soundtrack/build.py                 # 全部重新渲染（循环 + 叠层 + 过门）
python3 scripts/soundtrack/build.py hub sky-isles   # 只渲染指定曲目（含它们的过门）
python3 scripts/soundtrack/build.py --leads         # 只渲染过门
python3 scripts/soundtrack/build.py --meta          # 只刷新清单里的拍数 / 乐段，不渲染
```
