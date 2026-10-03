import React from 'react';
import {Img,useCurrentFrame} from 'remotion';
import {asset,C,deck,ease,Kinetic,Pointer,Proof,smooth,Stage} from './kit';
import timing from './timing.json';
export const Export:React.FC<{headline?:string}>=({headline='Export.'})=>{const f=useCurrentFrame(),press=timing.events.exportPress-timing.shots[6].from,open=timing.events.powerpoint-timing.shots[6].from,select=timing.events.nativeSelect-timing.shots[6].from,pack=smooth(f,press,press+23),editor=ease(f,open-4,open+11),zoom=smooth(f,select+7,select+25,1,2.15),camx=smooth(f,select+7,select+25,0,-274),camy=smooth(f,select+7,select+25,0,-77),out=smooth(f,156,177);return <Stage>
 <Kinetic text={headline} size={116} style={{position:'absolute',left:80,top:188,opacity:1-editor}}/>
 <Kinetic text="Editable PowerPoint." at={open} size={77} style={{position:'absolute',left:80,top:219,right:65,opacity:editor}}/>
 <div style={{opacity:1-editor}}>{[1,2,3,4,5].map((n,i)=><div key={n} style={{position:'absolute',left:80+i*187*(1-pack)+pack*310,top:419+pack*100+i*pack*8,width:172+pack*64,height:(172+pack*64)*9/16,borderRadius:9,overflow:'hidden',transform:`rotate(${pack*(i-2)*7}deg)`,opacity:1-ease(f,press+20,press+31),boxShadow:'0 15px 35px #101c3520'}}><Img src={n===1?asset('atlas-edited.png'):deck('executive',n)} style={{width:'100%'}}/></div>)}
  <div style={{position:'absolute',left:277,top:592,width:526,height:81,background:C.blue,color:'white',borderRadius:20,fontSize:37,fontWeight:650,display:'flex',alignItems:'center',justifyContent:'center',opacity:1-ease(f,press+3,press+12),transform:`scale(${f>=press&&f<press+4?.96:1})`}}>Export PowerPoint ↓</div>
  <div style={{position:'absolute',left:194,top:437,width:692,height:445,borderRadius:26,background:'white',boxShadow:'0 25px 60px #101c3520',textAlign:'center',opacity:ease(f,press+22,press+32),transform:`translateY(${ease(f,press+22,press+38,40,0)}px)`}}><div style={{margin:'39px auto 20px',width:130,height:130,background:'#fbe9dd',borderRadius:24,fontSize:83,color:'#cd5025',fontWeight:750}}>P</div><div style={{fontSize:46,fontWeight:700}}>Project-Atlas.pptx</div><div style={{fontSize:30,color:C.muted,marginTop:24}}>Your presentation, ready to use.</div></div>
 </div>
 <div style={{position:'absolute',left:64+326*out,top:421+109*out,width:952*(1-out)+300*out,height:566.7*(1-out)+178.6*out,borderRadius:18,overflow:'hidden',boxShadow:'0 25px 60px #101c3525',opacity:editor*(1-ease(f,171,177)),transform:`perspective(1800px) rotateY(${out*-7}deg)`}}><div style={{position:'absolute',left:camx*(1-out),top:camy*(1-out),width:952*(1-out)+300*out,height:566.7*(1-out)+178.6*out,transform:`scale(${zoom*(1-out)+out})`,transformOrigin:'0% 0%'}}><Img src={asset(`evidence/powerpoint-${f>=select?'selected':'open'}.png`)} style={{width:'100%',height:'100%'}}/></div></div>
 <div style={{position:'absolute',left:80,top:1026,fontSize:43,fontWeight:650,opacity:editor}}>Native text. Shapes. Layouts.</div>
 <Pointer x={ease(f,press-15,press,875,663)} y={ease(f,press-15,press,932,631)} press={press} f={f} opacity={1-ease(f,press+9,press+18)}/>
 <Proof style={{top:1110}}>Actual Atlas file opened in Microsoft PowerPoint</Proof>
 </Stage>;};
