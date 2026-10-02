"""Five standalone, five-slide showcase presentations.

python3 promo/showcase/presentations.py [--finalize] [--publish]
Designs extend the original showcase slides, using only native slide elements.
"""
import copy
import json
import pathlib
import shutil
import subprocess
import sys
from PIL import Image
import showcase as source

HERE = pathlib.Path(__file__).parent
PUBLIC = HERE.parents[1] / 'site/public/showcase/presentations'
T, S, P, free = source.T, source.S, source.P, source.free
FULL = source.CONTENT

CONFIG = {
    'executive': ('Project Atlas — Q4 Executive Review', 'Executive dashboard', 's1', 'Avenir Next', 'Avenir Next', 's1bg', 's1white', 's1navy', 's1slate', 's1blue', 's1track'),
    'architecture': ('AI Platform — Production Architecture', 'Technical architecture', 's2', 'Helvetica Neue', 'Helvetica Neue', 's2night', 's2node', 's2frost', 's2haze', 's2sky', 's2edge'),
    'analytics': ('From Growth to Retention', 'Data storytelling', 's3', 'Charter', 'Helvetica Neue', 's3paper', 's3wash', 's3ink', 's3stone', 's3coral', 's3hair'),
    'nova': ('NOVA — Your AI Workspace', 'Product launch', 's4', 'Helvetica Neue', 'Helvetica Neue', 's4white', 's4lav', 's4ink', 's4gray', 's4violet', 's4uiLine'),
    'transformation': ('From Manual to AI-Native', 'Transformation strategy', 's5', 'Futura', 'Gill Sans', 's5white', 's5nextSoft', 's5ink', 's5slate', 's5next', 's5hair'),
}


def txt(k, a, text, size=18, role='body', accent=False, muted=False, **kw):
    c = CONFIG[k]
    return T(a, text, role, size=size, font=c[3] if role in ('title', 'display', 'h2', 'h3') else c[4],
             tone=c[9] if accent else c[8] if muted else c[7], **kw)


def header(k, title, subtitle, n):
    c = CONFIG[k]
    return [txt(k, (.5, .5, 10, .25), c[1].upper(), 10.5, 'label', accent=True, weight='bold'),
            txt(k, (.5, .98, 12.33, .65), title, 30, 'title', weight='bold'),
            txt(k, (.5, 1.67, 11.8, .5), subtitle, 15, 'small', muted=True),
            source.hline(.5, 12.83, 6.76, c[10], .75),
            txt(k, (.5, 6.9, 10.4, .25), c[0] + '  ·  Illustrative demo', 10, 'caption', muted=True),
            txt(k, (11.8, 6.9, 1.03, .25), f'{n:02} / 05', 10, 'caption', muted=True, align='right')]


def slide(k, sid, message, items):
    return {'id': sid, 'message': message, 'background': CONFIG[k][5],
            'notes': 'Fictional demonstration data. ' + message, 'compose': {'free': {'items': items}}}


def card(k, a, items, fill=None):
    return free(a, items, surface={'fill': fill or CONFIG[k][6], 'radius': 10})


def metric(k, x, y, value, label, note, w=3.8):
    return [txt(k, (x, y, w, .85), value, 44, 'display', accent=True, weight='bold'),
            txt(k, (x, y+.92, w, .4), label, 18, 'h3', weight='bold'),
            txt(k, (x, y+1.4, w, .55), note, 13, 'small', muted=True)]


def steps(k, labels, y=3.1):
    items=[]
    for i,(title, detail) in enumerate(labels):
        x=.5+i*3.16
        items.append(card(k,(x,y,2.86,2.1),[
            txt(k,(x+.2,y+.18,2.46,.35), f'{i+1:02}',13,'small',accent=True,weight='bold'),
            txt(k,(x+.2,y+.7,2.46,.48),title,18,'h3',weight='bold'),
            txt(k,(x+.2,y+1.23,2.46,.62),detail,13,'small',muted=True)]))
        if i<3: items.append(S((x+2.93,y+.87,.15,.24),'chevron',fill=CONFIG[k][9]))
    return items


def bar(k,x,y,w,pct,tone=None,h=.14):
    return [S((x,y,w,h),'roundRect',fill=CONFIG[k][10],radius=3),
            S((x,y,w*pct,h),'roundRect',fill=tone or CONFIG[k][9],radius=3)]


def callout(k, text, y=5.72):
    return [card(k,(.5,y,12.33,.73),[txt(k,(.76,y+.16,11.8,.4),text,17,'h3',accent=True,weight='bold')])]


def originals():
    result = [copy.deepcopy(x) for x in (source.S1,source.S2,source.S3,source.S4,source.S5)]
    # Native lighting keeps each packaged deck self-contained for clean rebuilds.
    for sl in result:
        for node in sl['compose']['free']['items']:
            if 'image' in node:
                node.pop('image')
                node['texture']='lighting'
    def update(o):
        if isinstance(o,dict):
            for key,value in o.items():
                if key in ('text','message') and isinstance(value,str):
                    o[key]=value.replace('2024','2026')
                else: update(value)
        elif isinstance(o,list):
            for value in o: update(value)
    update(result)
    return result


def executive(first):
    k='executive'
    second=header(k,'Three workstreams. One critical dependency.','Product is ready; engineering and go-to-market converge on the beta gate.',2)
    for i,(name,pct,delivery,owner,tone) in enumerate([
        ('Product',.82,'Validated scope and UX','Maya Chen','s1blue'),
        ('Engineering',.74,'API, inference and hardening','Leo Martins','s1violet'),
        ('Go-to-Market',.58,'Enablement and beta demand','Priya Shah','s1amber')]):
        x=.5+i*4.18
        second.append(card(k,(x,2.55,3.97,2.66),[
            txt(k,(x+.25,2.78,3.47,.45),name,20,'h3',weight='bold'),
            txt(k,(x+.25,3.37,3.47,.73),f'{pct:.0%}',42,'display',weight='bold'),
            *bar(k,x+.25,4.18,3.47,pct,tone),
            txt(k,(x+.25,4.53,3.47,.35),delivery,12,'small',muted=True),
            txt(k,(x+.25,4.9,3.47,.24),'Owner: '+owner,10.5,'caption',muted=True)]))
    second+=callout(k,'Shared dependency: GPU capacity must be secured before integrated beta testing.')
    third=header(k,'Delivery is ahead of budget consumption.','A controlled reserve can protect the beta without changing the approved envelope.',3)
    third+=metric(k,.5,2.65,'$6.4M','Approved envelope','Total project funding')
    third+=metric(k,4.75,2.65,'$4.1M','Used to date','64% of approved budget')
    third+=metric(k,9,2.65,'$2.3M','Remaining','Includes a proposed $0.6M reserve')
    third += [txt(k,(.5,5.03,2.1,.35),'Scope delivered',13,'small'),*bar(k,2.85,5.13,8.3,.72),txt(k,(11.5,5.03,1.33,.35),'72%',14,'small',weight='bold',align='right'),
              txt(k,(.5,5.57,2.1,.35),'Budget consumed',13,'small'),*bar(k,2.85,5.67,8.3,.64,'s1violet'),txt(k,(11.5,5.57,1.33,.35),'64%',14,'small',weight='bold',align='right')]
    fourth=header(k,'A narrow risk window. A practical mitigation.','Treat capacity as a sourcing decision with a clear owner and deadline.',4)
    fourth += [card(k,(.5,2.55,5.5,3.8),[
        txt(k,(.8,2.85,4.9,.3),'MEDIUM RISK',11,'label',accent=True,weight='bold'),
        txt(k,(.8,3.35,4.9,1.2),'GPU allocation remains unconfirmed.',27,'h2',weight='bold'),
        txt(k,(.8,4.85,4.9,.7),'Exposure: public beta slips four to six weeks if supply is not secured.',16,'body',muted=True),
        txt(k,(.8,5.83,4.9,.3),'Owner: Engineering + Procurement',12,'small',weight='bold')],fill='s1redSoft')]
    for i,(date,title,detail) in enumerate([('DEC 2','Validate capacity','Confirm regional supply and performance.'),('DEC 6','Approve reserve','Commit $0.6M for dedicated allocation.'),('DEC 12','Close contract','Secure supply before the beta test gate.')]):
        y=2.65+i*1.2
        fourth += [txt(k,(6.5,y,1.15,.3),date,11,'label',accent=True,weight='bold'),txt(k,(7.85,y,4.7,.4),title,20,'h3',weight='bold'),txt(k,(7.85,y+.46,4.7,.55),detail,14,'body',muted=True)]
    fifth=header(k,'Approve the reserve. Protect the launch.','Decision required by December 6, 2026. Proposed release remains Q2 2027.',5)
    fifth += metric(k,.5,2.62,'$0.6M','Capacity reserve','Dedicated GPUs for beta and scale-up',5.1)
    fifth += [card(k,(6.4,2.5,6.43,2.6),[
        txt(k,(6.75,2.83,5.73,.4),'Approval conditions',21,'h3',weight='bold'),
        txt(k,(6.75,3.47,5.73,1.22),'Capacity confirmed in writing\nContract stays within approved budget\nPerformance validated before release',16,'body',leading=1.35)])]
    fifth+=callout(k,'Next gate: December 15 MVP release, followed by the February 15 public beta.')
    return [first,slide(k,'workstreams','Workstreams converge on a single capacity dependency.',second),slide(k,'budget','72% delivery with 64% budget consumption.',third),slide(k,'risk','Capacity risk has a dated mitigation plan.',fourth),slide(k,'decision','Approve a $0.6M capacity reserve by December 6.',fifth)]


def architecture(first):
    k='architecture'
    second=header(k,'One request. Four deliberate stages.','Bounded retries, streaming responses and trace context make the path production-ready.',2)
    second += steps(k,[('Accept','Gateway validates identity, quota and request schema.'),('Plan','Orchestrator selects retrieval, tools and model.'),('Execute','Services retrieve context and invoke allowed tools.'),('Respond','Stream output and record usage, latency and trace.')])
    second+=callout(k,'One trace ID spans the gateway, orchestrator, tool calls and model response.')
    third=header(k,'Ground the model in governed knowledge.','Separate ingestion from retrieval; keep citations and access control attached to context.',3)
    for y,labels in [(2.63,[('Documents','Object storage'),('Prepare','Parse and chunk'),('Embed','Versioned model'),('Index','Vector database')]),(4.2,[('Question','User context'),('Retrieve','Tenant filter'),('Generate','LLM + citations'),('Answer','Source references')])]:
        for i,(name,detail) in enumerate(labels):
            x=.5+i*3.16
            third.append(card(k,(x,y,2.86,1.17),[txt(k,(x+.2,y+.2,2.46,.38),name,20,'h3',weight='bold'),txt(k,(x+.2,y+.69,2.46,.26),detail,11,'caption',muted=True)]))
            if i<3: third.append(S((x+2.93,y+.45,.15,.24),'chevron',fill='s2violet'))
    third+=callout(k,'Enforce document permissions during retrieval; cache only within a tenant boundary.')
    fourth=header(k,'Trust boundaries are part of the architecture.','Identity, policy and tool permissions are enforced before an action reaches a system.',4)
    for i,(title,points,glyph,tone) in enumerate([
        ('Identity','OIDC and short-lived tokens\nTenant-scoped service calls\nLeast-privilege credentials','shield-check','s2sky'),
        ('Execution policy','Tool allowlists and budgets\nHuman approval for writes\nSandboxed execution','lock-keyhole','s2violet'),
        ('Audit and data','Encrypted storage and transport\nRedacted operational logs\nImmutable action history','database','s2teal')]):
        x=.5+i*4.18
        fourth.append(card(k,(x,2.6,3.97,3.53),[
            {'_abs':(x+.25,2.86,.42,.42),**source.icon(glyph,tone,28)},
            txt(k,(x+.25,3.48,3.47,.5),title,22,'h3',weight='bold'),
            txt(k,(x+.25,4.24,3.47,1.55),points,14,'body',muted=True,leading=1.45)]))
    fifth=header(k,'Ship safely. Observe continuously.','Illustrative service targets: 99.9% availability and p95 first token below 1.5 seconds.',5)
    fifth += steps(k,[('Build','CI runs unit, integration and policy checks.'),('Evaluate','Versioned datasets score quality and safety.'),('Canary','Route a small share of traffic to the new release.'),('Operate','Alert on SLO burn and roll back on regression.')],y=2.7)
    fifth+=callout(k,'Kubernetes runs the platform; observability connects release versions to live behavior.')
    return [first,slide(k,'request','Every production request is traceable and bounded.',second),slide(k,'retrieval','Retrieval preserves tenant permissions and citations.',third),slide(k,'security','Identity, execution and audit form explicit trust boundaries.',fourth),slide(k,'operations','Canary releases and SLOs close the operating loop.',fifth)]


def analytics(first):
    k='analytics'
    second=header(k,'Growth accelerated throughout the half.','Monthly active users grew from 42K to 79K; the largest absolute gain came in June.',2)
    second += [{'_abs':(.45,2.5,8.25,3.85),'chart':{'data':'mau','chart':'area','axis':'hairline','labels':'none','alt':'Monthly active users in thousands: 42, 47, 53, 61, 68, 79.'}}]
    second+=metric(k,9.1,2.65,'+88%','Six-month growth','37K additional monthly active users',3.7)
    second += [txt(k,(9.1,5.12,3.7,.5),'+11K in June',23,'h3',accent=True,weight='bold'),txt(k,(9.1,5.72,3.7,.54),'Momentum increases the value of fixing activation.',14,'body',muted=True)]
    third=header(k,'The first month is the retention fault line.','Retention loses 18 points first, then flattens toward a 62% month-six floor.',3)
    for i,v in enumerate([100,82,72,67,64,62]):
        y=2.5+i*.56
        third += [txt(k,(.5,y,1.25,.3),'Month '+str(i+1),13,'small'),*bar(k,2,y+.07,7.9,v/100,'s3coral' if i==1 else 's3ink',.24),txt(k,(10.2,y,1.3,.35),f'{v}%',16,'small',weight='bold')]
    third+=callout(k,'Focus onboarding on reaching first value; later retention losses are substantially smaller.',y=6.02)
    fourth=header(k,'Activation is the most actionable bottleneck.','The funnel is modeled from one month: 100K visitors, 32K sign-ups, 21K activated.',4)
    for i,(label,value,rate) in enumerate([('Visitors',100,'100K'),('Sign-ups',32,'32K'),('Activated',21,'21K'),('Paid',8.4,'8.4K')]):
        y=2.63+i*.65
        fourth += [txt(k,(.5,y,1.75,.4),label,16,'body'),S((2.5,y,7.4*value/100,.4),fill='s3coral' if i==2 else 's3ink'),txt(k,(10.3,y,2.53,.4),rate,20,'h3',weight='bold')]
    fourth+=callout(k,'11K sign-ups never activate. Fix the first successful workflow before buying more traffic.')
    fifth=header(k,'An activation experiment can unlock 1.8K paid users.','Scenario holds 32K sign-ups and 40% activated-to-paid conversion constant.',5)
    fifth+=metric(k,.5,2.55,'65.6%','Baseline activation','21K activated / 32K sign-ups')
    fifth+=metric(k,4.75,2.55,'80%','Target activation','25.6K activated at the same traffic')
    fifth+=metric(k,9,2.55,'+1.84K','Modeled paid lift','10.24K vs. 8.4K paid users')
    fifth += [source.hline(.5,12.83,4.85,'s3hair',.75),txt(k,(.5,5.08,3.8,.38),'TEST',11,'label',accent=True,weight='bold'),txt(k,(.5,5.57,3.8,.6),'Guided first workflow',17,'h3',weight='bold'),txt(k,(4.75,5.08,3.8,.38),'PRIMARY MEASURE',11,'label',accent=True,weight='bold'),txt(k,(4.75,5.57,3.8,.6),'Activation within 7 days',17,'h3',weight='bold'),txt(k,(9,5.08,3.8,.38),'GUARDRAIL',11,'label',accent=True,weight='bold'),txt(k,(9,5.57,3.8,.6),'30-day retention',17,'h3',weight='bold')]
    return [first,slide(k,'growth','MAU increased 88% in six months.',second),slide(k,'retention','The largest retention loss is the first transition.',third),slide(k,'funnel','11K sign-ups fail to reach activation.',fourth),slide(k,'experiment','An 80% activation scenario yields 1.84K additional paid users.',fifth)]


def nova(first):
    k='nova'
    second=header(k,'Your ideas should move faster than your tabs.','NOVA brings context, creation and execution into one workspace.',2)
    second += [txt(k,(.5,2.74,5.5,1.65),'Less switching.\nMore making.',42,'display',weight='bold',leading=1.08),txt(k,(.5,4.8,5.2,.9),'Keep your research, drafts, data and next actions connected.',20,'body',muted=True)]
    for i,(name,detail) in enumerate([('One context','Knowledge follows the work.'),('One canvas','Ideas become usable artifacts.'),('One flow','Actions continue after the draft.')]):
        y=2.65+i*1.13
        second.append(card(k,(6.75,y,6.08,.91),[txt(k,(7.02,y+.1,5.54,.35),name,19,'h3',accent=True,weight='bold'),txt(k,(7.02,y+.52,5.54,.27),detail,12,'small',muted=True)]))
    third=header(k,'Four capabilities. One connected canvas.','Every capability builds on the context already in your workspace.',3)
    for i,(name,detail,glyph) in enumerate([('Research','Find evidence and keep sources attached.','search'),('Create','Turn raw thinking into documents and slides.','pen-line'),('Analyze','Ask questions of data and explain the result.','chart-line'),('Automate','Hand off repeatable steps to governed agents.','workflow')]):
        x=.5+(i%2)*6.27;y=2.47+(i//2)*1.83
        third.append(card(k,(x,y,6.06,1.62),[{'_abs':(x+.28,y+.25,.36,.36),**source.icon(glyph,'s4violet',25)},txt(k,(x+.9,y+.2,4.85,.48),name,24,'h3',weight='bold'),txt(k,(x+.9,y+.88,4.85,.55),detail,16,'body',muted=True)]))
    fourth=header(k,'A launch plan, from first thought to next action.','An illustrative workflow: research a market, create a plan, then hand off the follow-through.',4)
    fourth+=steps(k,[('Ask','“Explore the market for our new product.”'),('Shape','Combine source evidence into a launch brief.'),('Create','Draft the launch plan and supporting assets.'),('Run','Track actions with approvals and clear owners.')],y=2.7)
    fourth+=callout(k,'From idea to execution without leaving your workspace.')
    fifth=slide(k,'closing','NOVA turns ideas into connected action.',[
        txt(k,(.5,.65,12.33,.4),'NOVA',18,'h3',accent=True,weight='bold',align='center'),
        txt(k,(1,2.13,11.33,.85),'Make room for',52,'title',weight='bold',align='center'),
        txt(k,(1,3.03,11.33,.9),'your next big idea.',52,'display',accent=True,weight='bold',align='center'),
        txt(k,(2,4.35,9.33,.7),'Research. Create. Analyze. Automate.',21,'body',muted=True,align='center'),
        card(k,(4.65,5.55,4.03,.67),[txt(k,(4.85,5.7,3.63,.36),'Your AI workspace',18,'h3',accent=True,weight='bold',align='center')]),
        txt(k,(.5,6.9,12.33,.25),'Fictional product concept  ·  Slide Agent showcase  ·  05 / 05',10,'caption',muted=True,align='center')])
    return [first,slide(k,'promise','NOVA removes context switching between ideas and actions.',second),slide(k,'capabilities','Research, create, analyze and automate share one canvas.',third),slide(k,'workflow','A connected workflow turns market research into a launch plan.',fourth),fifth]


def transformation(first):
    k='transformation'
    second=header(k,'Start where the workflow breaks.','Connect knowledge and assign ownership before increasing autonomy.',2)
    for i,(title,detail,move) in enumerate([('Fragmented tools','People rebuild context at every handoff.','Connect knowledge'),('Repetitive work','Teams spend capacity copying and routing.','Automate handoffs'),('Slow decisions','Evidence arrives after the decision window.','Surface insights')]):
        y=2.63+i*1.08
        second += [txt(k,(.5,y,3.5,.45),title,21,'h3',weight='bold'),txt(k,(4.25,y,4.6,.66),detail,16,'body',muted=True),S((9.15,y+.08,.24,.27),'chevron',fill='s5next'),txt(k,(9.65,y,3.18,.6),move,19,'h3',accent=True,weight='bold')]
    second+=callout(k,'Choose a high-volume workflow with a measurable outcome and an accountable owner.')
    third=header(k,'Autonomy grows inside a clear operating model.','People own outcomes; agents execute within policy; the platform supplies context and control.',3)
    for i,(title,points) in enumerate([('People','Outcome ownership\nException review\nWorkflow design'),('Agents','Bounded execution\nContext-aware actions\nTraceable handoffs'),('Platform','Connected knowledge\nIdentity and policy\nEvaluation and telemetry')]):
        x=.5+i*4.18
        third.append(card(k,(x,2.6,3.97,2.8),[txt(k,(x+.28,2.88,3.41,.5),title,24,'h3',accent=True,weight='bold'),txt(k,(x+.28,3.64,3.41,1.42),points,17,'body',muted=True,leading=1.4)]))
    third+=callout(k,'Expand permissions only when evaluations and operational evidence justify the next level.')
    fourth=header(k,'Three years. Three gates. Evidence at every step.','Foundation in 2026, scale in 2027, autonomy in 2028.',4)
    for i,(year,name,detail,gate) in enumerate([('2026','Foundation','Connect knowledge\nSet identity and policy\nPilot two workflows','Gate: reliable first value'),('2027','Scale','Roll out team copilots\nAutomate cross-team flows\nMeasure adoption and ROI','Gate: repeatable outcomes'),('2028','Autonomy','Deploy bounded agents\nOrchestrate end-to-end flows\nOptimize continuously','Gate: controlled autonomy')]):
        x=.5+i*4.18
        fourth += [txt(k,(x,2.55,3.97,.8),year,44,'display',accent=True,weight='bold'),source.hline(x,x+3.97,3.54,'s5next',3),txt(k,(x,3.8,3.97,.5),name,23,'h3',weight='bold'),txt(k,(x,4.48,3.97,1.25),detail,16,'body',muted=True,leading=1.3),txt(k,(x,5.99,3.97,.36),gate,12,'small',accent=True,weight='bold')]
    fifth=header(k,'Fund the foundation. Measure the transformation.','Release investment in stages, with explicit evidence for each expansion.',5)
    fifth+=metric(k,.5,2.61,'2','Pilot workflows','Named owners and documented baselines')
    fifth+=metric(k,4.75,2.61,'90 days','First evidence gate','Value, adoption and quality measured')
    fifth+=metric(k,9,2.61,'3','Success measures','Time saved, cycle time and error rate')
    fifth+=callout(k,'Approve the foundation phase: knowledge, governance and two measurable workflow pilots.')
    return [first,slide(k,'diagnosis','Connected knowledge and ownership precede autonomy.',second),slide(k,'operating-model','People, agents and platform have distinct responsibilities.',third),slide(k,'roadmap','Three years of initiatives advance through evidence gates.',fourth),slide(k,'investment','Stage investment against measurable workflow outcomes.',fifth)]


def intent_for(k, slides):
    c=CONFIG[k]
    language=copy.deepcopy(source.INTENT['design']['language'])
    palette={key:value for key,value in language['color']['palette'].items() if key.startswith(c[2])}
    language['color']={'palette':palette,'roles':{'background':c[5],'surface':c[6],'text':c[7],'muted':c[8],'accent':c[9],'rule':c[10]},'data':[c[9],c[7]]}
    language['type']['display']['family']=c[3]
    language['type']['body']['family']=c[4]
    language['texture'] = [x for x in language['texture'] if k=='architecture']
    if k in ('architecture','nova'):
        language['texture'].append({'id':'lighting','primitive':'gradient-wash','params':{'from':c[5],'to':'s2violet' if k=='architecture' else 's4lav','angle':315,'opacity':.08 if k=='architecture' else .8}})
    language['charts']['highlight']=c[9]
    for s in slides: source.resolve(s['compose'],FULL)
    return {'schema':'slide-agent.intent/1','brief':{'title':c[0],'audience':c[1]+' audience','goal':slides[-1]['message'],'format':'16:9'},
            'direction':{'concept':f'{c[1]} with {c[3]} display typography, an intentional five-slide narrative and varied compositions.','fit':'ask'},
            'design':{'language':language},'data':copy.deepcopy(source.INTENT['data']) if k=='analytics' else {},'slides':slides}


def run(args, log):
    r=subprocess.run(['slide-agent',*args],capture_output=True,text=True)
    log.write_text(r.stdout)
    try:
        data=json.loads(r.stdout);v=data.get('verdict',data)
    except ValueError: raise RuntimeError(r.stderr or r.stdout)
    print(log.parent.name,v.get('state'),flush=True)
    for issue in v.get('issues',[]):
        if issue['severity']!='minor':print(' ',issue,flush=True)
    return v


def publish(k, folder):
    out=folder/'out'; target=PUBLIC/k;target.mkdir(parents=True,exist_ok=True)
    shutil.copy(out/'deck.pptx',target/f'{k}.pptx')
    shutil.copy(out/'exports/deck.pdf',target/f'{k}.pdf')
    images=[]
    for i in range(1,6):
        src=out/f'render/slide-{i}.png';shutil.copy(src,target/f'{i:02}.png');images.append(Image.open(src).convert('RGB'))
    tw,th,gap=640,360,16
    sheet=Image.new('RGB',(tw*2+gap*3,th*3+gap*4),'#e7eaf0')
    for i,im in enumerate(images):
        sheet.paste(im.resize((tw,th),Image.Resampling.LANCZOS),(gap+(i%2)*(tw+gap),gap+(i//2)*(th+gap)))
    sheet.save(target/'contact-sheet.png')


def main():
    makers=[executive,architecture,analytics,nova,transformation]
    for (k,c),maker,first in zip(CONFIG.items(),makers,originals()):
        folder=HERE/'presentations'/k;folder.mkdir(parents=True,exist_ok=True)
        intent=intent_for(k,maker(first));(folder/'intent.json').write_text(json.dumps(intent,indent=1,ensure_ascii=False))
        v=run(['build','--intent',str(folder/'intent.json'),'--deck',str(folder/'out')],folder/'build.json')
        if v.get('state') not in ('ready-unrendered','ready'):
            raise RuntimeError(f'{k}: build requires attention; see {folder / "build.json"}')
        if '--finalize' in sys.argv:
            v=run(['finalize','--deck',str(folder/'out'),'--export','pdf,png'],folder/'finalize.json')
            if v.get('state')!='ready':
                raise RuntimeError(f'{k}: finalize requires attention; see {folder / "finalize.json"}')
            if '--publish' in sys.argv:publish(k,folder)


if __name__=='__main__':main()
