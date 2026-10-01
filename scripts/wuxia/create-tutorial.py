"""Build the Chinese web lesson and printable guide from the same source."""
from pathlib import Path
import html
import json

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'deliverables/wuxia-duel-20260930'

PROMPT = '''制作一段12秒、16:9、720p的真人电影风格武侠短片。
恰好两名成年剑客：左侧青衣，深蓝长袍、银色护腕、束发；右侧赤衣，暗红长袍、金色护腕、束发。两人的脸、衣服和武器在所有镜头里保持一致。
场景是雨夜古代庭院：湿石板、木门、瓦檐、竹影、暖灯笼、冷月光。人物面部曝光清楚。
0—2秒：双人中远景，两人对峙并起剑。
2—7秒：保持双方全身可见，青衣斜劈，赤衣格挡并反击；青衣后撤接招，再突刺，赤衣侧步化解。展示起手、接触、回弹和重心转移。
7—10秒：低一些的侧前方机位，赤衣横扫，青衣闪避后转身回击。脚踩实地面，衣摆与水花跟随动作。
10—12秒：双人近景，两剑交叉锁住，缓慢推近，以两人对峙结束。
动作有力量且看得清楚，握剑正确，避免人物互换、身体变形和长时间离地。无血腥、无对白、无画面标题。
声音包含克制的鼓点、紧张弦乐、雨声、破风与同步的刀剑碰撞。'''

SECTIONS = [
 dict(id='start',title='先看成片，选一条练习路线',goal='知道你手上有哪些文件，不需要从零开始生成。',
  paragraphs=['这次已经完成两种结果：12秒真人风格AI视频，以及32秒原创3D动画。它们使用同一组创意设定，但分别制作。真人版通过文字提示生成，没有把3D动画上传为运动参考。',
  '如果你只想学会剪辑，按第2、6、8步做即可。想理解为什么这样设计，再看第3—5步；想管理不同结果，再看第7步。'],
  steps=['打开案例页面，先完整观看12秒真人版，再看32秒3D版。','练习剪辑：选择“雨门双锋-3D分镜项目.json”。','研究原生动画：选择“雨门双锋-3D动作项目.json”。','比较结果：选择“雨门双锋-Studio项目.json”。'],
  figure='ai-poster.jpg',caption='实际真人风格成片：两名剑客与交叉的剑刃。',done='我已经看过成片，并选好了练习项目。'),
 dict(id='import',title='打开 Studio，导入已有项目',goal='让当前素材进入一个可以播放和剪辑的工作区。',
  paragraphs=['本案例使用独立工作区 http://127.0.0.1:5193/。导入项目会替换这个工作区当前打开的项目；如有自己的修改，先保存项目文件。原来的5173主工作区另行保留。'],
  steps=['进入5193工作区，点击顶部项目名称，打开“你的项目”。','先点“保存项目文件”保存当前内容，再点“导入项目文件”。','在本案例文件夹中选择“雨门双锋-3D分镜项目.json”。','点击顶部“故事板”，应看到8个镜头；点击“时间线”，总时长应为32.0秒。','播放几秒，确认画面出现、进度在走，再开始修改。'],
  rows=[['主项目','12秒真人视频 + 32秒3D视频 + 原生3D候选'],['分镜项目','8个片段，使用已经完成的32秒3D视频'],['动作项目','原生GLB动画，附32秒原创音轨']],
  note='项目JSON保存剪辑关系，媒体引用来自本机 .mouva-ai/wuxia。换电脑时需要重新导入MP4、GLB与WAV，不能只拷贝JSON。',done='我在故事板看到了8个镜头，时间线能播放。'),
 dict(id='story',title='把“武打大片”拆成角色与镜头',goal='先规定谁在打、怎么打、镜头看哪里。',
  paragraphs=['人物需要明显的视觉区别。本例固定为青衣与赤衣，并保持青衣在左、赤衣在右的初始位置。衣服、发型、护腕和剑都写进设定，减少切镜后认错角色。',
  '一个动作单位写成“进攻→格挡→反击→回到架势”。每次进攻都要有对手的反应；只写“猛烈打斗”通常无法说清双方关系。'],
  rows=[['青衣','深蓝长袍、银色护腕；斜劈与突刺为主'],['赤衣','暗红长袍、金色护腕；格挡、侧步与反击'],['0—2秒','对峙：双人中远景，建立位置与场景'],['2—7秒','攻防：看得见脚步、剑刃和双方反应'],['7—10秒','反攻：改变机位，保持动作方向可辨'],['10—12秒','锁锋：双人近景，形成清楚的结束画面']],
  figure='真人武打-镜头检查.jpg',caption='六个实际视频帧。下表是提交的节奏设计，实际时间分配会有偏差。',
  steps=['写出两个人各自的服装、武器和初始位置。','把一句“打起来”改写成三次有因果的攻防。','在结尾指定一个能看懂的双人画面。'],done='我能用几句话说明两个人与一轮完整攻防。'),
 dict(id='prompt',title='写出能执行的生成描述',goal='把创意变成角色、动作、摄影与声音的明确要求。',
  paragraphs=['描述按六部分组织：时长画幅→角色→场景→分段动作→摄影→声音。把“双人全身可见”“脚踩实地面”“保持服装与面孔一致”写进去，比只堆电影感形容词更能表达意图。',
  '下面是中文写法示例。实际提交的完整英文原文保存在“真人视频生成提示词.txt”。本次通过项目内Seedance脚本提交1条12秒视频，模型自带的生成标识保留在输出中。'],
  steps=['先把两位角色与场景固定，再添加动作，不在同一段里反复更换人物设定。','一段12秒短片只安排少量可辨认的攻防与结尾，避免塞进一整部电影的情节。','只改一个问题，例如“运镜慢一点、保持双方全身可见”，再比较新结果。'],
  prompt=PROMPT,
  note='Studio里的“视频成片”走3D运动参考编排，需要运动参考发布服务。本次文字生成脚本与这条界面流程不同；不要把案例里的真人结果理解为已经执行了3D参考生成。',done='我已经写好或复制了一个有明确双人关系的描述。'),
 dict(id='animation',title='理解原生 3D：动画藏在哪里',goal='分清可播放视频、3D模型和可以继续改的内容。',
  paragraphs=['MP4保存最终画面；GLB保存角色、庭院与动画轨道；项目JSON告诉Studio用哪个版本、在哪一段时间播放。三者用途不同。',
  '本例的32秒动作由程序编排：双方起剑、格挡、突刺、跃起反击和收锋。角色姿态按时间插值，接触时两把剑朝向共同碰撞点。然后采样导出GLB，包含78条动画轨道。'],
  figure='native-animation-proof.png',caption='Studio原生渲染器实际播放GLB的画面，光线和电影版渲染会有区别。',
  steps=['导入“雨门双锋-3D动作项目.json”，选择32秒原生动作镜头。','确认预览的是“可编辑3D·双人原始动作”，再点“编辑3D”。','播放动作；拖动播放位置，分别查看开头、交锋与结尾。','先调整摄像机距离或角度，观察两个人是否都在画面中。','返回时间线，重新播放，确认预览与剪辑使用的版本一致。'],
  note='当前场景将两名角色与庭院装在一个GLB模型节点里。可直接改整体位置、缩放、机位与剪辑速度；单独重排角色招式要改动作源码或在支持动画编辑的3D工具里修改GLB。',done='我知道哪些内容能在Studio直接改，哪些需要重新编排动画。'),
 dict(id='edit',title='动手练习：把第三个镜头放慢',goal='不用调用模型，完成一次能看到结果的剪辑。',
  paragraphs=['重新导入“雨门双锋-3D分镜项目.json”，选择第三个镜头“侧步与突刺”。它引用原视频的9.6—14.4秒，片段长4.8秒。',
  '本练习保持裁剪范围不变，只将第三个镜头速度改为0.75倍。这个片段将变为6.4秒；其他七个镜头不变时，整段从32秒变为33.6秒。'],
  steps=['在故事板或时间线里选中“侧步与突刺”，确认正在查看已采用版本。','打开右侧Agent，选择“编辑”模式；在即时剪辑中选“播放速度”。','把速度下拉框改为0.75×，修改会直接应用。','看成片时长并播放：第三段应变慢，整体约33.6秒。','用顶部“撤销”恢复，再用“重做”确认修改可以恢复。','也可以在“镜头属性→剪辑”中设置播放速度；自然语言指令可写“只把当前镜头设为0.75倍，不改裁剪范围”。'],
  rows=[['原片段','(14.4 − 9.6) ÷ 1 = 4.8秒'],['放慢后','(14.4 − 9.6) ÷ 0.75 = 6.4秒'],['新的总时长','32 − 4.8 + 6.4 = 33.6秒']],
  note='即时剪辑下拉框不调用生成模型。Agent的自然语言指令会调用已配置的编辑模型，并按“自动应用编辑”设置执行或等待应用。',calculator=True,done='第三个镜头已放慢，我也测试了撤销与重做。'),
 dict(id='takes',title='用候选版本管理“抽卡”结果',goal='保留已有好版本，只针对明确问题继续探索。',
  paragraphs=['打开“雨门双锋-Studio项目.json”，点击“候选卡组”。这里有真人视频、3D电影版和原生3D三种结果。它们用于学习预览与采用，并不是同一提示词重复生成的三次AI抽卡。',
  '预览一个候选只是查看；点“采用这一版”才会进入当前剪辑。本例两个备选为32秒，采用后时长会跟随候选变成32秒。原生3D候选本身没有电影版MP4的内嵌声音，需要使用动作项目的音轨。'],
  steps=['先播放真人版，记下想保留的角色、构图和结尾。','切换查看3D电影版，比较动作节奏，不要求两种风格完全相同。','收藏喜欢的候选；在修正说明里记录一个具体问题。','要用于成片时，再点击“采用这一版”，然后检查时间线时长与声音。','如果要探索新的模型结果，保留已采用版本，先写清修正重点，再提交新的候选。'],
  rows=[['模糊反馈','再做得好一点'],['可执行反馈','保持青衣与赤衣外观，只减慢镜头移动，双方全身持续可见'],['比较顺序','角色一致→动作关系→画面稳定→节奏与声音']],
  note='新增模型候选会产生新的调用。单纯查看、收藏和采用现有版本不需要重新生成；当前参考发布服务未配置时，界面会阻止运动参考成片生成。',done='我能区分“预览”和“采用”，并写出一个具体的修正重点。'),
 dict(id='export',title='加标题、检查声音，再导出',goal='把修改落实成一个新的MP4，保留原始素材。',
  paragraphs=['在第三个镜头的0.75倍练习完成后，可以给第一镜头加标题。不要给已经混入声音的3D电影版再叠加同一条WAV，否则刀剑声和音乐会重复。',
  '3D分镜项目使用的MP4已经包含配乐与音效；原生3D动作项目才使用独立WAV。真人AI视频的声音来自模型生成，与3D音轨来源不同。'],
  steps=['选择第一镜头，Agent即时剪辑切到“字幕”，输入“雨门·双锋”，点“添加字幕”。','在字幕属性里设置文字起止时间与位置，让标题避开人物面孔与剑刃。','播放完整时间线，检查第3段速度、标题范围、声音和镜头衔接。','点击顶部“导出”：格式MP4、分辨率720p、帧率24、画幅16:9。','勾选包含声音与文字字幕，点击“导出电影”。等待生成任务完成后下载。','把新文件命名为“雨门双锋-练习版.mp4”，再保存一份修改后的项目JSON。'],
  rows=[['画面标准','1280×720，16:9，24帧/秒'],['练习版时长','仅第三段改为0.75倍时，约33.6秒'],['保存两份','MP4供观看，项目JSON供继续编辑']],
  note='导出是本地渲染与编码，不会重新生成画面。720p素材导出为4K只会放大尺寸，本练习保持720p即可。',done='我已检查全片，并保存了练习版视频与项目文件。'),
 dict(id='reuse',title='排查问题，复用到下一个故事',goal='保留结构，换掉角色、场景或动作主题。',
  paragraphs=['下一次可以沿用“对峙→攻防→反攻→结束”的结构，换成雪地、竹林或屋顶。先改一种变量，确认新场景成立，再继续改动作和摄影。',
  '示例目标：两名角色仍穿青衣与赤衣，只把庭院改成雪地，保留全身攻防和双剑锁锋的结尾。这样比较时能知道改动来自哪里。'],
  rows=[['网页打不开','服务可能已停止。可先双击本文件夹的index.html或直接播放MP4。'],['视频或模型不出现','确认用的是5193独立工作区；JSON里的媒体不是跨电脑可用的文件包。'],['编辑控件变灰','先切回已采用版本，或在候选卡组采用要编辑的候选。'],['两张卡片一起移动','空白处拖动是在平移画布；移动单卡片应拖卡片标题或非控件区域。'],['苹果鼠标操作','滑动平移；按Control再拖动或滚动用于缩放。'],['普通鼠标操作','普通滚轮保持缩放，Shift+滚轮左右移动；空白处拖动平移。'],['运动参考生成不可用','查看“服务设置”。本例真人视频采用独立文字生成方式，未配置长期运动参考发布服务。']],
  done='我已经保存本案例，并写出了下一段短片的一个改动方向。'),
]

def esc(x): return html.escape(str(x),quote=True)

def web_section(s,i):
    parts=[f'<section id="{s["id"]}" class="lesson"><div class="stephead"><span>{i:02d}</span><div><p class="eyebrow">第{i}步</p><h2>{esc(s["title"])}</h2><p class="goal">{esc(s["goal"])}</p></div></div>']
    parts += [f'<p>{esc(p)}</p>' for p in s.get('paragraphs',[])]
    if s.get('figure'): parts.append(f'<figure><img src="{esc(s["figure"])}" alt="{esc(s["caption"])}"><figcaption>{esc(s["caption"])}</figcaption></figure>')
    if s.get('steps'): parts.append('<ol>'+''.join(f'<li>{esc(p)}</li>'for p in s['steps'])+'</ol>')
    if s.get('rows'): parts.append('<table><tbody>'+''.join(f'<tr><th scope="row">{esc(a)}</th><td>{esc(b)}</td></tr>'for a,b in s['rows'])+'</tbody></table>')
    if s.get('prompt'): parts.append('<div class="copybar"><strong>中文提示词模板</strong><button type="button" id="copy-prompt">复制模板</button></div><textarea id="prompt-template" readonly aria-label="中文武打提示词模板">'+esc(s['prompt'])+'</textarea><p class="downloadline"><a download href="真人视频生成提示词.txt">下载实际提交的完整提示词原文 ↓</a></p>')
    if s.get('calculator'): parts.append('''<div class="calculator"><h3>先算一算：改速度会延长多少？</h3><p>以第三个镜头为例，裁剪范围保持9.6—14.4秒。</p><label>播放速度 <input id="lesson-speed" type="range" min="0.25" max="2" step="0.25" value="0.75"><output id="speed-label">0.75倍</output></label><div class="results"><div><strong id="clip-result">6.4秒</strong><span>这个片段</span></div><div><strong id="total-result">33.6秒</strong><span>修改后全片</span></div></div><small>这里只计算示例时长，不修改Studio项目，也不发起生成。</small></div>''')
    if s.get('note'): parts.append(f'<aside class="note">{esc(s["note"])}</aside>')
    parts.append(f'<label class="done"><input type="checkbox" data-step="{s["id"]}"><span>{esc(s["done"])}</span></label></section>')
    return ''.join(parts)

STYLE='''
:root{color-scheme:dark;--bg:#0b1115;--panel:#121b20;--line:#293a41;--text:#e3edeb;--muted:#9db2b4;--green:#c8ddaf}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:90px}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.9 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}a{color:var(--green);text-decoration:none}a:hover{text-decoration:underline}header{height:70px;display:flex;justify-content:space-between;align-items:center;padding:0 4vw;border-bottom:1px solid var(--line);background:#0b1115f5;position:sticky;top:0;z-index:10}header b{font-size:22px;letter-spacing:-.6px}header nav{display:flex;gap:25px;font-size:13px}.hero{max-width:1320px;padding:58px 4vw 38px;margin:auto;display:grid;grid-template-columns:1.15fr 1fr;gap:45px;align-items:center}.eyebrow{font-size:12px;letter-spacing:.15em;color:var(--green);margin:0!important}h1{font-size:clamp(28px,3.3vw,45px);font-weight:500;line-height:1.4;margin:15px 0 18px;letter-spacing:.025em}.hero p{color:var(--muted)}.hero img{width:100%;border-radius:14px;border:1px solid var(--line)}.tags{display:flex;gap:9px;flex-wrap:wrap;margin:22px 0}.tags span{font-size:12px;padding:5px 11px;border:1px solid var(--line);border-radius:999px;color:var(--muted)}.btn{display:inline-block;background:var(--green);color:#142018;border:1px solid var(--green);padding:9px 17px;border-radius:7px;font-weight:600;font-size:13px}.btn.secondary{background:none;color:var(--text);border-color:var(--line)}.buttons{display:flex;gap:10px;flex-wrap:wrap}.course{max-width:1320px;margin:auto;padding:0 4vw 70px;display:grid;grid-template-columns:235px minmax(0,1fr);gap:46px}.toc{position:sticky;top:94px;height:fit-content;border-top:1px solid var(--line);padding-top:20px}.toc h3{font-size:15px;font-weight:500;margin:0 0 7px}.toc p{font-size:12px;color:var(--muted)}.toc a{display:block;color:var(--muted);font-size:13px;padding:9px 0;border-bottom:1px solid #1a292e}.toc a.active{color:var(--green)}.progress{height:4px;background:#26363c;border-radius:9px;margin:15px 0}#progress-bar{height:100%;width:0;background:var(--green);transition:width .2s}.lesson{padding:34px 0 42px;border-top:1px solid var(--line)}.stephead{display:flex;gap:22px;align-items:start;margin-bottom:24px}.stephead>span{font-size:32px;line-height:1.5;color:#68807c}.stephead h2{font-size:27px;line-height:1.4;font-weight:500;margin:5px 0 9px}.goal{font-size:14px;color:var(--muted);margin:0}.lesson>p{color:var(--muted);margin:14px 0}ol{padding-left:22px;margin:22px 0}li{padding:5px 0 5px 6px}figure{margin:25px 0}figure img{width:100%;display:block;border-radius:9px;border:1px solid var(--line)}figcaption{font-size:12px;color:var(--muted);margin-top:8px}table{width:100%;border-collapse:collapse;margin:22px 0;line-height:1.7;font-size:13px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:13px 15px}th{width:29%;font-weight:500;color:var(--green);background:#152026}td{color:var(--muted)}.note{background:#192720;border:1px solid #35463b;border-radius:8px;padding:17px 20px;font-size:13px;color:#b5c6b6;margin:24px 0}.done{display:flex;align-items:start;gap:11px;padding:15px 18px;background:var(--panel);border:1px solid var(--line);border-radius:8px;margin-top:25px;font-size:13px;cursor:pointer}.done input{margin:6px 0 0;accent-color:var(--green)}.copybar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:25px}.copybar strong{font-size:14px;font-weight:500}button{font:inherit;cursor:pointer;background:#24392f;color:var(--green);border:1px solid #45614d;border-radius:6px;padding:6px 12px;font-size:13px}textarea{width:100%;height:390px;resize:vertical;color:#c0d3cf;background:#101a1e;border:1px solid var(--line);border-radius:8px;padding:18px;font-size:14px;line-height:1.9;font-family:inherit;margin-top:12px}.downloadline{font-size:13px}.calculator{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:22px}.calculator h3{font-weight:500;font-size:17px;margin:0}.calculator p,.calculator small{color:var(--muted);font-size:13px}.calculator label{display:flex;align-items:center;gap:18px;font-size:13px}input[type=range]{flex:1;accent-color:var(--green)}.results{display:flex;gap:55px;margin:25px 0}.results strong{display:block;font-size:29px;font-weight:500;color:var(--green)}.results span{color:var(--muted);font-size:12px}.appendix{padding:30px;background:var(--panel);border:1px solid var(--line);border-radius:12px}.appendix h2{font-size:23px;font-weight:500;margin:0 0 15px}.appendix p{font-size:13px;color:var(--muted)}details{padding:13px 0;border-top:1px solid var(--line)}summary{cursor:pointer;font-size:14px}pre{overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#0b1418;padding:18px;font:12px/1.8 ui-monospace,monospace;color:#b8ccc7;border-radius:8px}.bottom{font-size:12px;color:var(--muted);margin-top:30px}video{width:100%;border-radius:9px;margin-top:12px;background:black}:focus-visible{outline:2px solid var(--green);outline-offset:4px}@media(max-width:920px){.course{grid-template-columns:190px minmax(0,1fr);gap:25px}.hero{gap:25px}.stephead h2{font-size:23px}}@media(max-width:680px){header{height:auto;padding:15px 22px;gap:15px;align-items:start}header nav{gap:12px;flex-wrap:wrap;font-size:12px}.hero{grid-template-columns:1fr;padding:30px 22px}.course{display:block;padding:0 22px 45px}.toc{position:static;margin-bottom:30px}.toc a{display:inline-block;padding:8px 13px 8px 0}.stephead{gap:14px}.stephead h2{font-size:23px}.lesson{padding-top:28px}th,td{padding:10px;font-size:12px}.results{gap:30px}.appendix{padding:20px}.calculator label{gap:10px}textarea{height:470px}}
'''

ADVANCED = [
 ('重新启动本地工作区（不新增AI调用）','cd /Users/liuyang/Desktop/mouva-video\nMOUVA_AI_PORT=5193 MOUVA_AI_DATA_DIR=.mouva-ai/wuxia node bridge/server.mjs'),
 ('重新打开案例与教程（不新增AI调用）','cd /Users/liuyang/Desktop/mouva-video\nnode scripts/wuxia/render.mjs --serve'),
 ('重做本地3D输出（不会调用Seedance）','cd /Users/liuyang/Desktop/mouva-video\nnode scripts/wuxia/render.mjs --render --glb\nnode scripts/wuxia/audio.mjs\n/opt/homebrew/bin/ffmpeg -y -i deliverables/wuxia-duel-20260930/silent.mp4 -i deliverables/wuxia-duel-20260930/原创配乐与刀剑音效.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart deliverables/wuxia-duel-20260930/雨门双锋-3D武打短片.mp4'),
]

def build_html():
    toc=''.join(f'<a href="#{s["id"]}">{i:02d} · {esc(s["title"])}</a>'for i,s in enumerate(SECTIONS,1))
    sections=''.join(web_section(s,i)for i,s in enumerate(SECTIONS,1))
    advanced=''.join(f'<details><summary>{esc(title)}</summary><pre>{esc(cmd)}</pre></details>'for title,cmd in ADVANCED)
    document=f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>雨门双锋 · 制作教程 — Mouva Studio</title><style>{STYLE}</style></head><body>
<header><b>mouva studio</b><nav><a href="http://127.0.0.1:5193/" target="_blank" rel="noopener">打开Studio</a><a href="index.html">查看案例</a><a download href="雨门双锋-制作教程.pdf">保存PDF教程 ↓</a></nav></header>
<div class="hero"><div><p class="eyebrow">创作教程 / 001</p><h1>从两位剑客<br>到一段完整短片</h1><p>用《雨门·双锋》的实际素材，学会角色设定、双人攻防、候选比较，以及在Studio里继续剪辑。</p><div class="tags"><span>9个步骤</span><span>适合初次操作</span><span>现有素材即可练习</span></div><div class="buttons"><a class="btn" href="#import">先开始剪辑练习 →</a><a class="btn secondary" href="#story">了解制作思路</a></div></div><figure style="margin:0"><img src="ai-poster.jpg" alt="实际成片中两名剑客锁剑的近景"><figcaption>已完成的真人风格样片，教程使用它与32秒3D版本作为例子。</figcaption></figure></div>
<div class="course"><aside class="toc"><h3>按步骤完成</h3><p id="progress-label">已完成0 / 9步</p><div class="progress"><div id="progress-bar"></div></div>{toc}<p>进度只保存于当前浏览器。<br>无需填写账号或上传素材。</p></aside><main>{sections}<section class="appendix"><h2>进阶：本地制作与源码</h2><p>第一次学习可跳过。重做3D输出前，先备份原有素材并停止5191预览服务，避免覆盖与端口冲突。源文件在项目的scripts/wuxia目录中；scene.mjs编排角色与镜头，audio.mjs合成音轨，render.mjs导出动画与视频。</p>{advanced}<details><summary>这次真人视频如何提交</summary><p>通过scripts/wuxia/generate-ai.mjs调用项目已有Seedance服务，提交1条12秒、720p文字生成任务。脚本在ai-generation.json保留任务记录，重跑会查询已有任务；如制作新任务，应另存新项目与记录，不能删除旧记录冒充恢复。</p><p>本教程不提供自动重复付费生成按钮。将3D运动参考用于真人成片是另一条扩展流程，需要发布服务，本次案例没有执行这一步。</p></details><details><summary>可复制的下一次创作练习</summary><p>保留两名剑客的服装、武器和起始位置，只把场景改成雪地。沿用对峙、攻防、反攻、锁锋的四段结构，先检查人物一致性，再决定是否继续改动作。</p></details><div class="buttons" style="margin-top:22px"><a class="btn secondary" href="index.html">回到案例与素材下载</a><a class="btn" download href="雨门双锋-制作教程.pdf">下载PDF教程 ↓</a></div></section><footer class="bottom">Mouva Studio · 中文制作教程 · 2026年9月30日<br>依据本机项目与实际输出编写。界面功能会随项目后续更新而变化。</footer></main></div>
<script>
const storageKey='mouva-wuxia-tutorial-progress-v1';let saved={{}};try{{saved=JSON.parse(localStorage.getItem(storageKey)||'{{}}')}}catch{{}}
if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={{}};
const checks=Array.from(document.querySelectorAll('[data-step]'));function progress(){{const n=checks.filter(c=>c.checked).length;document.querySelector('#progress-label').textContent='已完成'+n+' / 9步';document.querySelector('#progress-bar').style.width=(n/9*100)+'%';}}
for(const c of checks){{c.checked=saved[c.dataset.step]===true;c.addEventListener('change',()=>{{saved[c.dataset.step]=c.checked;try{{localStorage.setItem(storageKey,JSON.stringify(saved))}}catch{{}}progress()}})}}progress();
const slider=document.querySelector('#lesson-speed');slider.addEventListener('input',()=>{{const v=Number(slider.value),d=4.8/v;document.querySelector('#speed-label').textContent=v+'倍';document.querySelector('#clip-result').textContent=d.toFixed(1)+'秒';document.querySelector('#total-result').textContent=(32-4.8+d).toFixed(1)+'秒'}});
document.querySelector('#copy-prompt').addEventListener('click',async e=>{{const t=document.querySelector('#prompt-template');try{{await navigator.clipboard.writeText(t.value);e.target.textContent='已复制'}}catch{{t.focus();t.select();e.target.textContent='已选中，请手动复制'}}}});
const observer=new IntersectionObserver(entries=>{{for(const x of entries)if(x.isIntersecting){{for(const a of document.querySelectorAll('.toc a'))a.classList.toggle('active',a.hash==='#'+x.target.id)}}}},{{rootMargin:'-15% 0px -65% 0px'}});document.querySelectorAll('.lesson').forEach(s=>observer.observe(s));
</script></body></html>'''
    (OUT/'tutorial.html').write_text(document)
    (OUT/'tutorial-content.json').write_text(json.dumps(SECTIONS,ensure_ascii=False,indent=2))
    (OUT/'中文武打提示词模板.txt').write_text(PROMPT+'\n\n这是中文写法示例，实际提交原文另见“真人视频生成提示词.txt”。\n')
    case=OUT/'index.html'
    text=case.read_text()
    if 'href="tutorial.html"' not in text:
        text=text.replace('<span>创作案例 / 001</span>','<a href="tutorial.html" style="font-size:13px;color:var(--accent)">查看制作教程 →</a>')
    case.write_text(text)

def build_pdf():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak, KeepTogether
    from PIL import Image as PILImage
    pdfmetrics.registerFont(TTFont('MouvaCN','/System/Library/Fonts/Supplemental/Arial Unicode.ttf'))
    ink=colors.HexColor('#142c33'); muted=colors.HexColor('#506c70');accent=colors.HexColor('#496a55');line=colors.HexColor('#d8e2dd')
    style=ParagraphStyle('Body',fontName='MouvaCN',fontSize=10,leading=17,textColor=ink,wordWrap='CJK',spaceAfter=9)
    small=ParagraphStyle('Small',parent=style,fontSize=8.5,leading=13,textColor=muted,spaceAfter=6)
    head=ParagraphStyle('Heading',parent=style,fontSize=22,leading=30,spaceAfter=12,textColor=ink)
    label=ParagraphStyle('Label',parent=small,textColor=accent,fontSize=9,leading=14)
    code=ParagraphStyle('Code',parent=small,fontSize=8,leading=12)
    def p(t,sty=style):return Paragraph(esc(t).replace('\n','<br/>'),sty)
    story=[]
    for i,s in enumerate(SECTIONS,1):
        if i>1:story.append(PageBreak())
        story += [p(f'第 {i:02d} 步 / 共 9 步',label),p(s['title'],head),p(s['goal'],small),Spacer(1,9)]
        for t in s.get('paragraphs',[]):story.append(p(t))
        if s.get('figure'):
            file=OUT/s['figure'];w,h=PILImage.open(file).size;ratio=min(480/w,170/h)
            story += [Spacer(1,6),Image(str(file),w*ratio,h*ratio),Spacer(1,5),p(s['caption'],small),Spacer(1,8)]
        for n,t in enumerate(s.get('steps',[]),1):story.append(p(f'{n}. {t}'))
        if s.get('rows'):
            table=Table([[p(a,small),p(b,small)]for a,b in s['rows']],colWidths=[130,350],hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(0,-1),colors.HexColor('#edf3ef')),('LINEBELOW',(0,0),(-1,-1),.5,line),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
            story += [Spacer(1,6),table,Spacer(1,10)]
        if s.get('prompt'):story += [p('中文提示词模板',label),p(s['prompt'],small)]
        if s.get('note'):
            note=Table([[p(s['note'],small)]],colWidths=[480]);note.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#edf3ef')),('BOX',(0,0),(-1,-1),.6,line),('TOPPADDING',(0,0),(-1,-1),11),('BOTTOMPADDING',(0,0),(-1,-1),6),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12)]));story += [Spacer(1,6),note,Spacer(1,12)]
        story.append(p('完成检查：'+s['done'],label))
    story += [PageBreak(),p('进阶附录',label),p('本地制作与复用',head),p('初次学习可以跳过本页。重做3D输出前，先备份原有素材并停止5191预览服务，避免覆盖与端口冲突。网页另有速度计算器、提示词复制与进度勾选。',small),p('查看入口',label),p('案例：http://127.0.0.1:5191/film/index.html\n教程：http://127.0.0.1:5191/film/tutorial.html\nStudio：http://127.0.0.1:5193/',small)]
    for title,cmd in ADVANCED:story += [Spacer(1,10),p(title,label),p(cmd,code)]
    story += [Spacer(1,12),p('本次真人AI调用的原文与记录',label),p('真人视频生成提示词.txt保存实际提交原文；ai-generation.json保存生成记录。脚本generate-ai.mjs已完成一条任务；本教程不再次提交付费生成。',small),p('下一次练习',label),p('保持青衣、赤衣与双剑攻防，只把庭院换成雪地。先改一种变量，再检查人物、动作、机位与声音。',style)]
    def chrome(c,doc):
        w,h=A4;c.setFillColor(ink);c.setFont('Helvetica-Bold',11);c.drawString(44,h-30,'mouva studio')
        c.setFont('MouvaCN',8);c.setFillColor(muted);c.drawRightString(w-44,h-30,'雨门·双锋 / 制作教程')
        c.setStrokeColor(line);c.line(44,h-40,w-44,h-40);c.line(44,41,w-44,41)
        c.setFont('MouvaCN',8);c.drawString(44,26,'中文教程 · 2026年9月30日');c.drawRightString(w-44,26,str(doc.page))
    doc=SimpleDocTemplate(str(OUT/'雨门双锋-制作教程.pdf'),pagesize=A4,rightMargin=57,leftMargin=57,topMargin=62,bottomMargin=57,title='雨门双锋：双人武打短片制作教程',author='Mouva Studio')
    doc.build(story,onFirstPage=chrome,onLaterPages=chrome)

if __name__=='__main__':
    import sys
    if '--web' in sys.argv:build_html()
    if '--pdf' in sys.argv:build_pdf()
    print('教程已写入：',OUT)
