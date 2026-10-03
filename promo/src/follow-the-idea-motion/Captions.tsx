import React from 'react';
import {useCurrentFrame} from 'remotion';
import words from './captions.json';

export const pages:typeof words[]=[];
let sentence:typeof words=[];
const flush=()=>{
 if(!sentence.length)return;
 const count=Math.ceil(sentence.map(x=>x.text).join('').length/39);
 let remaining=[...sentence];
 for(let i=0;i<count;i++){
  let n=Math.ceil(remaining.length/(count-i));
  if(i<count-1&&n>1&&/^(and|or)$/i.test(remaining[n-1].text.trim()))n--;
  pages.push(remaining.slice(0,n));remaining=remaining.slice(n);
 }
 sentence=[];
};
for (const w of words) {
 if(sentence.length&&w.startMs-sentence[sentence.length-1].endMs>450)flush();
 sentence.push(w);if(/[.!?]$/.test(w.text))flush();
}
flush();
export const CaptionLayer:React.FC = () => {const t=useCurrentFrame()/30*1000; const p=pages.find(p=>t>=p[0].startMs&&t<p[p.length-1].endMs+110);if(!p)return null;return <div style={{position:'absolute',left:80,right:80,bottom:80,display:'flex',justifyContent:'center',fontFamily:'Arial, sans-serif'}}><div style={{background:'#101b31',color:'#fff',fontSize:56,lineHeight:1.12,padding:'14px 24px',borderRadius:12,textAlign:'center',boxShadow:'0 8px 25px #0002'}}>{p.map(w=><span key={w.startMs}>{w.text}</span>)}</div></div>};
