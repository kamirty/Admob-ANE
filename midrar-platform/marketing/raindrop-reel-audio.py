# يصنع صوت المقطع بـ ffmpeg: مطر خفيف طوال المقطع، وهمسة لكل مسحة من البندول، وقطرة عند كل خطوة، ورنّة للمصباح، وسقطة أخيرة للشعار.
import subprocess, sys
out = sys.argv[1]
HALF = 1.55
CUT = 4.5 * HALF
SH = CUT - 5.85
DUR = 21 + SH
u = lambda x: x + SH  # من زمن المشاهد اللاحقة إلى زمن المقطع

SR = 44100
src = {
    'whoosh': "anoisesrc=d=0.7:c=pink:a=0.6:r=44100,bandpass=f=1100:width_type=o:w=1.4,afade=t=in:d=0.3,afade=t=out:st=0.3:d=0.4,volume=0.55",
    'swoop': "anoisesrc=d=0.9:c=brown:a=0.7:r=44100,lowpass=f=900,afade=t=in:d=0.35,afade=t=out:st=0.35:d=0.55,volume=0.8",
    'snap': "aevalsrc='0.5*sin(2*PI*(2400-1600*t)*t)*exp(-40*t)':d=0.15:s=44100",
    'drip': "aevalsrc='0.55*sin(2*PI*(520+1500*exp(-28*t))*t)*exp(-8*t)':d=0.6:s=44100,aecho=0.6:0.4:60:0.25",
    'click': "aevalsrc='0.35*sin(2*PI*1900*t)*exp(-55*t)+0.2*sin(2*PI*2850*t)*exp(-70*t)':d=0.12:s=44100",
    'ding': "aevalsrc='0.22*(sin(2*PI*660*t)+0.55*sin(2*PI*990*t)+0.3*sin(2*PI*1320*t))*exp(-2.2*t)':d=2.2:s=44100,aecho=0.7:0.5:180:0.3",
    'done': "aevalsrc='0.25*(sin(2*PI*880*t)*exp(-6*t)+sin(2*PI*1320*(t-0.09))*exp(-6*(t-0.09))*gte(t,0.09))':d=0.8:s=44100",
    'splash': "aevalsrc='0.7*sin(2*PI*(260+900*exp(-22*t))*t)*exp(-5*t)':d=1.4:s=44100,aecho=0.8:0.6:120|260:0.35|0.2",
    'shimmer': "aevalsrc='0.12*(sin(2*PI*1568*t)+sin(2*PI*2093*t)+sin(2*PI*2637*t))*exp(-1.6*t)*(1-exp(-30*t))':d=2.6:s=44100,aecho=0.8:0.7:90|200:0.4|0.25",
}
events = [('whoosh', (k + 0.5) * HALF - 0.3) for k in range(4)]
events += [('snap', CUT), ('swoop', u(6.2)), ('ding', u(7.5)), ('swoop', u(10.4))]
events += [('drip', u(t)) for t in (11.9, 13.6, 15.3)]
events += [('click', u(11.9 + .55)), ('click', u(13.6 + .55)), ('done', u(15.3 + 1.3))]
events += [('splash', u(17.35)), ('shimmer', u(17.5))]

args = ['ffmpeg', '-v', 'error', '-y']
# 0: المطر
args += ['-f', 'lavfi', '-i', f"anoisesrc=d={DUR:.3f}:c=pink:a=0.5:r=44100,highpass=f=1200,lowpass=f=6500,volume=0.07,afade=t=in:d=1.2,afade=t=out:st={DUR-1.2:.3f}:d=1.2"]
for name, _ in events:
    args += ['-f', 'lavfi', '-i', src[name]]
parts = []
for i, (_, at) in enumerate(events, start=1):
    ms = max(0, int(at * 1000))
    parts.append(f"[{i}]adelay={ms}|{ms},apad=whole_dur={DUR:.3f}[e{i}]")
mix = ''.join(f"[e{i}]" for i in range(1, len(events) + 1))
parts.append(f"[0]{mix}amix=inputs={len(events)+1}:normalize=0,atrim=0:{DUR:.3f},alimiter=limit=0.9[a]")
args += ['-filter_complex', ';'.join(parts), '-map', '[a]', '-ac', '2', '-ar', '44100', out]
subprocess.run(args, check=True)
print('audio', out, f'{DUR:.3f}s', len(events), 'events')
