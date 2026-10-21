export const emptyState = () => ({schema_version:'1.0',shifts:[],reference_tables:[],review_items:[],settings:{timezone:'Asia/Seoul'},imports:[]});
const dateOK = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
const timeOK = s => s===null || s===undefined || (typeof s==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s));
export function validate(data) {
 if(!data || data.schema_version!=='1.0') throw Error('지원하는 schema_version은 1.0입니다.');
 if(!Array.isArray(data.shifts)||!Array.isArray(data.reference_tables)||!Array.isArray(data.review_items)) throw Error('shifts, reference_tables, review_items 배열이 필요합니다.');
 const dates=new Set();
 for(const s of data.shifts){
  if(!dateOK(s.date)||dates.has(s.date)) throw Error('잘못되거나 중복된 일정 날짜: '+s.date);
  dates.add(s.date);
  if(!['duty','continuation','off','standby','daytime','cancelled','unknown'].includes(s.kind)) throw Error('알 수 없는 근무 종류: '+s.date);
  if(typeof s.dia_raw!=='string'||(s.dia!==null&&typeof s.dia!=='string')) throw Error('DIA는 문자열 또는 null이어야 합니다.');
  for(const k of ['work_minutes','printed_minutes']) if(s[k]!=null&&(!Number.isInteger(s[k])||s[k]<0)) throw Error('근무시간은 0 이상의 정수 분이어야 합니다.');
  if(s.distance_km!=null&&(typeof s.distance_km!=='number'||!Number.isFinite(s.distance_km)||s.distance_km<0)) throw Error('주행거리가 올바르지 않습니다.');
  if(s.linked_start_date!=null&&!dateOK(s.linked_start_date)) throw Error('연결 날짜가 올바르지 않습니다.');
 }
 const ids=new Set();
 for(const t of data.reference_tables){
  if(typeof t.reference_id!=='string'||!t.reference_id||ids.has(t.reference_id)||!Array.isArray(t.entries)) throw Error('기준표 ID 또는 entries가 잘못되었습니다.');
  ids.add(t.reference_id);
  if(t.effective_from!=null&&!dateOK(t.effective_from)) throw Error('기준표 적용 시작일이 올바르지 않습니다.');
  const keys=new Set();
  for(const e of t.entries){
   const key=e.dia+'/'+e.day_type;
   if(typeof e.dia!=='string'||keys.has(key)||!['weekday','holiday','all'].includes(e.day_type)||!['active','cancelled'].includes(e.status)||!timeOK(e.start_time)||!timeOK(e.end_time)||![null,undefined,0,1].includes(e.end_day_offset)) throw Error('기준표 항목이 올바르지 않습니다: '+key);
   keys.add(key);
  }
 }
 if(data.settings!=null){
  if(typeof data.settings!=='object'||Array.isArray(data.settings))throw Error('설정 형식이 올바르지 않습니다.');
  if(!timeOK(data.settings.daytime_start)||!timeOK(data.settings.daytime_end))throw Error('주간근무 시각이 올바르지 않습니다.');
  if(data.settings.holiday_dates!=null&&(!Array.isArray(data.settings.holiday_dates)||!data.settings.holiday_dates.every(dateOK)))throw Error('공휴일 날짜가 올바르지 않습니다.');
 }
 if(data.review_items.some(r=>!r||typeof r!=='object'))throw Error('검토사항 형식이 올바르지 않습니다.');
 return data;
}
export function merge(current,incoming,replace=false){
 validate(incoming);
 if(replace) return {...emptyState(),...structuredClone(incoming)};
 const next=structuredClone(current), map=new Map(next.shifts.map(s=>[s.date,s]));
 // Imported reference identifiers are local to each file: remap to avoid overwriting history.
 const prefix=Date.now()+'-'+Math.random().toString(36).slice(2,8), ids=new Map();
 for(const t of incoming.reference_tables){const id=prefix+'/'+t.reference_id;ids.set(t.reference_id,id);next.reference_tables.push({...t,reference_id:id});}
 for(const s of incoming.shifts) map.set(s.date,{...s,reference_id:ids.get(s.reference_id)||null});
 next.shifts=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
 next.settings={...next.settings,...incoming.settings};
 next.review_items.push(...incoming.review_items);
 next.imports.push({at:new Date().toISOString(),count:incoming.shifts.length});
 return next;
}
export function lookup(state,s){
 if(!s||['off','cancelled','continuation'].includes(s.kind)) return {};
 if(s.kind==='daytime') return {start:state.settings.daytime_start,end:state.settings.daytime_end};
 const candidates=[...state.reference_tables].reverse().filter(t=>t.effective_from&&t.effective_from<=s.date).sort((a,b)=>b.effective_from.localeCompare(a.effective_from));
 const explicit=state.reference_tables.find(t=>t.reference_id===s.reference_id);
 const t=explicit||candidates[0];
 if(!t) return {note:'적용 기준표 확인 필요'};
 const dow=new Date(s.date+'T12:00:00+09:00').getUTCDay();
 const weekend=dow===0||dow===6;
 const holidays=state.settings.holiday_dates||[];
 const rule=state.settings.holiday_rule;
 if(rule!=='weekends_and_kr_public_holidays') return {note:'휴일 적용 규칙 확인 필요'};
 // Never infer Korean public holidays from weekday alone. Users supply confirmed dates.
 const holiday=weekend||holidays.includes(s.date);
 const day=holiday?'holiday':'weekday';
 const e=t.entries.find(e=>e.dia===s.dia&&e.day_type===day)||t.entries.find(e=>e.dia===s.dia&&e.day_type==='all');
 if(!e)return {note:'DIA 기준 없음'};
 if(e.status==='cancelled')return {note:'기준표상 운휴 · 일정 확인'};
 return {start:e.start_time,end:e.end_time,offset:e.end_day_offset,note:!holiday?'평일표 적용 · 공휴일 여부 확인': '휴일표 적용'};
}
export const duration=m=>m==null?'미확인':`${Math.floor(m/60)}시간 ${m%60}분`;
export const provisionalRestRule={dayMinutes:60,overnightMinutes:390};
export function departure(state,s){
 if(!s)return {};
 if(s.kind==='continuation'){
  const prev=new Date(Date.parse(s.date)-86400000).toISOString().slice(0,10);
  const parent=state.shifts.find(p=>p.date===prev&&p.kind==='duty'&&p.dia===s.dia&&(!s.linked_start_date||s.linked_start_date===prev));
  return parent?{...departure(state,parent),continued:true,startDate:prev}:{};
 }
 const info=lookup(state,s);
 if(!info.start||info.end||!['duty','daytime','standby'].includes(s.kind)||!Number.isInteger(s.work_minutes))return info;
 const [h,m]=info.start.split(':').map(Number),base=h*60+m+s.work_minutes;
 const tomorrow=new Date(Date.parse(s.date)+86400000).toISOString().slice(0,10);
 const continuation=state.shifts.some(p=>p.date===tomorrow&&p.kind==='continuation'&&p.dia===s.dia);
 // First try the day allowance; crossing midnight or an explicit continuation selects the overnight allowance.
 const overnight=continuation||base+provisionalRestRule.dayMinutes>=1440;
 const rest=overnight?provisionalRestRule.overnightMinutes:provisionalRestRule.dayMinutes,total=base+rest;
 return {...info,end:`${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`,offset:Math.floor(total/1440),estimated:true,restMinutes:rest};
}
