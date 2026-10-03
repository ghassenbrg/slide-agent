import {useCurrentFrame} from 'remotion';
import words from './captions.json';
export const pages:typeof words[]=[];
let buffer:typeof words=[];
const flush=()=>{if(!buffer.length)return;const groups=Math.ceil(buffer.map(w=>w.text).join('').length/35);let left=[...buffer];for(let i=0;i<groups;i++){const take=Math.ceil(left.length/(groups-i));pages.push(left.slice(0,take));left=left.slice(take);}buffer=[];};
for(const w of words){if(buffer.length&&w.startMs-buffer[buffer.length-1].endMs>450)flush();buffer.push(w);if(/[.!?]$/.test(w.text))flush();}flush();
export const CaptionLayer=()=>{const t=useCurrentFrame()/30*1000,p=pages.find(p=>t>=p[0].startMs&&t<p[p.length-1].endMs+100);if(!p)return null;return <div style={{position:'absolute',left:80,right:80,bottom:76,display:'flex',justifyContent:'center',zIndex:30,fontFamily:'BrandInter,Arial,sans-serif'}}><div style={{padding:'15px 22px',fontSize:58,fontWeight:550,lineHeight:1.12,color:'white',background:'#101c35',borderRadius:13,textAlign:'center',boxShadow:'0 10px 30px #101c3525'}}>{p.map(w=><span key={w.startMs}>{w.text}</span>)}</div></div>;};
