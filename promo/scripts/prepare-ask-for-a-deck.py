import json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
d=json.loads((ROOT/'ask-for-a-deck/analysis/beat_data.json').read_text()); T=d['T']
f=lambda n:round(n*T*30)
cuts=[0,f(16),f(22),f(36),f(50),f(64),f(80),f(92),1560]
ids=['opening','connect','create','preview','edit','range','export','close']
shots=[{'id':id,'from':cuts[i],'duration':cuts[i+1]-cuts[i]} for i,id in enumerate(ids)]
events={'reveal':f(5),'connect':f(18),'send':f(28),'result':f(32),'preview2':f(40),'preview5':f(45),'editSend':f(56),'editResult':f(58),'rangeTech':f(69),'rangeData':f(74),'exportPress':f(82),'powerpoint':f(85),'nativeSelect':f(88),'brand':f(93)}
config={'fps':30,'duration':1560,'period':T,'shots':shots,'events':events}
(ROOT/'src/ask-for-a-deck/timing.json').write_text(json.dumps(config,indent=2))
(ROOT/'ask-for-a-deck/timing.json').write_text(json.dumps(config,indent=2))
texts=[('hook',.14,2.4,'Presentations take time.'),('intro',2.72,7.90,'Meet Slide Agent. Create professional presentations directly through your AI agent.'),('connect',8.03,10.77,'Add it to a supported agent.'),('create',11.06,14.6,'Describe your presentation, audience, and style.'),('preview',18.12,20.45,'Preview the complete deck.'),('edit',24.92,28.7,'Want a different headline? Ask your agent.'),('range-project',31.72,33.65,'Project updates.'),('range-technical',34.13,36.12,'Technical reviews.'),('range-data',36.6,38.7,'Data stories.'),('export',39.58,42.2,'Export an editable PowerPoint.'),('close',45.5,51.65,'Slide Agent. Explore examples and installation at slide-agent dot ghassen dot io.')]
(ROOT/'ask-for-a-deck/voiceover.json').write_text(json.dumps([{'id':id,'start':s,'end':e,'text':t}for id,s,e,t in texts],indent=2))
print(json.dumps({'cuts':cuts,'events':events,'words':sum(len(t.split())for _,_,_,t in texts)},indent=2))
