# 配乐生成程序

挥杆之间 0.21 的全部背景音乐由这里的程序写出并渲染：一首主题、十种变奏。

- `score.py`：主题旋律（音级 + 八分音符时值，16 小节 A / A' / B / A''）、和声进行与调式 / 摇摆 / 人性化处理。
- `parts.py`：伴奏型（拨弦 oom-pah、圆舞曲伴奏、竖琴琶音、十六分音符发条音型、行走低音、导音线对位、定音鼓滚奏、竖琴刮奏、打击乐）。
- `variants.py`：十段曲目的编曲（`CUES`）。
- `engine.py`：FluidSynth 渲染、声像、均衡、混响、压缩、限幅。
- `build.py`：渲染并写出 `screen-web/assets/music/*.mp3` 与 `soundtrack.json`。

需要：Python 3、numpy、scipy、ffmpeg（含 libmp3lame）和 libfluidsynth；音色库默认 `/usr/share/sounds/sf2/TimGM6mb.sf2`，可用环境变量 `SWINGLINK_SF2` 换成别的 .sf2。

```sh
python3 scripts/soundtrack/build.py            # 全部重新渲染
python3 scripts/soundtrack/build.py hub sky-isles   # 只渲染指定曲目
```
