/* BilaVoice 3.0.0 · MIT · Long Ngo · 2026
 * Human speech uses Web Speech / an optional VieNeu backend.
 * 27-FSK is a deterministic DATA carrier and is not spoken Vietnamese.
 */
(() => {
  "use strict";
  const C = window.RingCore, A = window.RingAudio, B = window.VoiceBridge;
  const $ = id => document.getElementById(id);
  const statusBox = $("appStatus");
  let latest = null, fskBytes = null, fskSamples = null;
  let fskUrl = null, refUrl = null, cloneUrl = null, cloudUrl = null;
  let recognition = null, validatedReference = null;
  let voices = [];
  const ctxRing = $("ring").getContext("2d");
  const ctxWave = $("waveCanvas").getContext("2d");
  function status(message, type = "") {
    statusBox.className = "status" + (type ? " " + type : "");
    statusBox.textContent = message;
  }
  function prettyTrit(v) { return "[" + v.map(x => x > 0 ? "+1" : String(x)).join(", ") + "]"; }
  function paintRing(j = 0) {
    const canvas = $("ring"), ctx = ctxRing, n = canvas.width, c = n / 2, r = n * .31;
    ctx.clearRect(0,0,n,n);
    const g = ctx.createRadialGradient(c,c,0,c,c,r * 1.55);
    g.addColorStop(0,"#193c4044");g.addColorStop(1,"#04091400");
    ctx.fillStyle = g;ctx.fillRect(0,0,n,n);
    for(const factor of [.45,.72,1,1.14]) {
      ctx.beginPath();ctx.arc(c,c,r * factor,0,Math.PI * 2);
      ctx.strokeStyle = "#37576388";ctx.lineWidth = factor===1?2:1;ctx.stroke();
    }
    for(let i=0;i<108;i++) {
      const a=2*Math.PI*i/108 - Math.PI/2, active=i===j*4;
      const long=i%4===0;
      ctx.beginPath();ctx.moveTo(c+(r+7)*Math.cos(a),c+(r+7)*Math.sin(a));
      ctx.lineTo(c+(r+(active?35:(long?22:9)))*Math.cos(a),c+(r+(active?35:(long?22:9)))*Math.sin(a));
      ctx.lineWidth=active?5:(long?2.3:1.2);
      ctx.strokeStyle=active?"#c8ff68":(long?"#78a99b":"#354c5a");
      ctx.stroke();
    }
    for(let i=0;i<27;i++) {
      const a=2*Math.PI*i/27-Math.PI/2;
      ctx.beginPath();ctx.arc(c+(r-13)*Math.cos(a),c+(r-13)*Math.sin(a),2.5,0,Math.PI*2);
      ctx.fillStyle=i===j?"#c8ff68":"#58978999";ctx.fill();
    }
    const a=2*Math.PI*j/27 - Math.PI/2;
    ctx.beginPath();ctx.moveTo(c,c);ctx.lineTo(c+(r-22)*Math.cos(a),c+(r-22)*Math.sin(a));
    ctx.strokeStyle="#c8ff68";ctx.lineWidth=4;ctx.stroke();
    ctx.beginPath();ctx.arc(c+(r-22)*Math.cos(a),c+(r-22)*Math.sin(a),9,0,Math.PI*2);ctx.fillStyle="#c8ff68";ctx.fill();
    ctx.beginPath();ctx.arc(c,c,5,0,Math.PI*2);ctx.fillStyle="#f6fafc";ctx.fill();
    ctx.font="600 21px Space Grotesk, sans-serif";ctx.textAlign="center";ctx.fillStyle="#b8c6d7";
    [["0°",0],["90°",Math.PI/2],["180°",Math.PI],["270°",Math.PI*1.5]].forEach(([text,ang])=>{
      let a=ang-Math.PI/2;ctx.fillText(text,c+(r+77)*Math.cos(a),c+(r+77)*Math.sin(a)+6);
    });
    $("ringIndex").textContent=String(j*4).padStart(3,"0");
    $("ringAngle").textContent=(j*360/27).toFixed(2)+"°";
  }
  function paintWave(j=0,samples=null) {
    const canvas=$("waveCanvas"), ctx=ctxWave,w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.strokeStyle="#284257";ctx.lineWidth=1;
    for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(0,h*i/5);ctx.lineTo(w,h*i/5);ctx.stroke();}
    ctx.strokeStyle="#8ceccb";ctx.lineWidth=2;ctx.beginPath();
    if(samples && samples.length){
      const step=Math.max(1,Math.floor(samples.length/w));
      for(let x=0;x<w;x++){const value=samples[Math.min(samples.length-1,x*step)];const y=h/2-value*h*.4;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
    } else {
      const frequency=600+80*j;
      for(let x=0;x<w;x++){const value=.75*Math.sin(2*Math.PI*frequency*x/24000);const y=h/2-value*h*.35;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
    }
    ctx.stroke();
    ctx.font="13px ui-monospace,monospace";ctx.fillStyle="#9eb2c9";ctx.fillText(samples?"27-FSK payload waveform (subsampled)":(600+80*j)+" Hz / representative symbol",20,25);
  }
  function selectSymbol(j){
    const v=C.symbolToVector(C.ALPHABET[j]);
    $("symbolSlider").value=String(j);
    $("symbolNumber").textContent=String(j)+" · "+(j===0?"SPACE":C.ALPHABET[j]);
    $("vectorDetails").textContent="j="+j+" · θ="+v.angleDeg.toFixed(2)+"° · ("+v.x.toFixed(4)+", "+v.y.toFixed(4)+") · "+prettyTrit(C.symbolsToTrits(C.ALPHABET[j])[0]);
    paintRing(j);paintWave(j);
  }
  function renderBridge(record, updateTts=false) {
    latest=record;
    $("cvnss").value=record.cvss;
    $("trits").textContent=record.trits.slice(0,5).map(prettyTrit).join("  ") || "(rỗng)";
    $("envelope").textContent=record.symbols.slice(0,38)+(record.symbols.length>38?"…":"")+" · "+record.symbols.length+" ký hiệu";
    $("decodedText").textContent=record.canonicalUnicode ?? record.unicode;
    if (updateTts) $("ttsText").value=record.canonicalUnicode ?? record.unicode;
    if(record.ambiguous.length) {
      $("audit").textContent=record.ambiguous.length+" từ có nhiều ứng viên khi giải mã canonical: "+
        record.ambiguous.slice(0,4).map(x=>x.code+" → "+x.candidates.join(" / ")).join("; ")+".";
    }else{
      $("audit").textContent="Không phát hiện nhóm nhập nhằng trong các từ đang kiểm tra. Kết quả này không chứng minh mọi văn bản giải mã đều đơn ánh.";
    }
    const first=record.symbols[0];
    selectSymbol(first?C.charToValue(first):0);
  }
  function encode(){
    try {
      const record=B.fromVoiceTranscript($("transcript").value);
      renderBridge(record,true);
      status("Đã mã hóa Unicode → CVNSS4.0 → Base27/3-trit. Chuỗi UTF-8 trong envelope có thể khôi phục chính xác.", "success");
    }catch(e){status("Mã hóa thất bại: "+e.message,"error");}
  }
  function decode(){
    try {
      const record=B.fromCvss($("cvnss").value);
      renderBridge(record,true);
      status("Đã giải CVNSS → Unicode (canonical policy). Đối chiếu cảnh báo nhập nhằng nếu có.","success");
    }catch(e){status("Giải mã thất bại: "+e.message,"error");}
  }
  function setupSpeechRecognition(){
    const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Speech){$("micStart").disabled=true;status("Trình duyệt này không có SpeechRecognition. Nhập văn bản hoặc dùng STT tại backend cục bộ.", "");return;}
    recognition=new Speech();
    recognition.lang="vi-VN";recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=1;
    recognition.onresult=ev=>{
      let combined="";
      for(let i=0;i<ev.results.length;i++)combined += ev.results[i][0].transcript+" ";
      $("transcript").value=combined.trim();
      if (Array.from(ev.results).every(item=>item.isFinal)) encode();
    };
    recognition.onerror=ev=>status("Không thể nhận giọng nói: "+ev.error+". Kiểm tra quyền microphone, mạng hoặc dùng nhập tay.","error");
    recognition.onstart=()=>{ $("micStart").disabled=true;$("micStop").disabled=false;status("Microphone đang nghe. Hãy đọc tiếng Việt tự nhiên.");};
    recognition.onend=()=>{$("micStart").disabled=false;$("micStop").disabled=true;};
    $("micStart").addEventListener("click",()=>{try{recognition.start();}catch(e){status(e.message,"error");}});
    $("micStop").addEventListener("click",()=>recognition.stop());
  }
  function loadVoices() {
    if(!window.speechSynthesis)return;
    voices=window.speechSynthesis.getVoices();
    const list=$("voiceSelect"), prev=list.value;
    list.textContent="";
    const def=document.createElement("option");def.value="";def.textContent="Giọng mặc định của trình duyệt";list.appendChild(def);
    const ordered=[...voices].sort((a,b)=>Number(b.lang.toLowerCase().startsWith("vi"))-Number(a.lang.toLowerCase().startsWith("vi")));
    for(const v of ordered){
      const opt=document.createElement("option");
      opt.value=v.voiceURI;opt.textContent=v.name+" ("+v.lang+")";
      list.appendChild(opt);
    }
    list.value=prev;
  }
  function speak(){
    if(!window.speechSynthesis){status("Trình duyệt không hỗ trợ SpeechSynthesis.","error");return;}
    const text=$("ttsText").value.trim();
    if(!text){status("Văn bản TTS trống.","error");return;}
    window.speechSynthesis.cancel();
    const utter=new SpeechSynthesisUtterance(text);utter.lang="vi-VN";utter.rate=1;utter.pitch=1;
    const chosen=voices.find(v=>v.voiceURI===$("voiceSelect").value);
    if(chosen)utter.voice=chosen;
    utter.onerror=event=>status("TTS trình duyệt gặp sự cố: "+event.error,"error");
    utter.onstart=()=>status("Đang đọc tiếng Việt bằng bộ TTS của trình duyệt (không phải VieNeu clone).","success");
    window.speechSynthesis.speak(utter);
  }
  function validatePcmWav(buffer) {
    const v=new DataView(buffer);
    if(v.byteLength<44)throw Error("WAV quá ngắn.");
    function str(i,n){let s="";for(let j=0;j<n;j++)s+=String.fromCharCode(v.getUint8(i+j));return s;}
    if(str(0,4)!=="RIFF"||str(8,4)!=="WAVE")throw Error("Không phải WAV RIFF.");
    let fmt=null, data=null;
    for(let off=12;off+8<=v.byteLength;){
      const size=v.getUint32(off+4,true),start=off+8;
      if(start+size>v.byteLength)throw Error("WAV không toàn vẹn.");
      if(str(off,4)==="fmt " && size>=16)fmt={format:v.getUint16(start,true),channels:v.getUint16(start+2,true),rate:v.getUint32(start+4,true),bits:v.getUint16(start+14,true)};
      if(str(off,4)==="data")data=size;
      off=start+size+(size%2);
    }
    if(!fmt || data===null || fmt.format!==1 || fmt.channels!==1 || fmt.bits!==16 || !fmt.rate)throw Error("Mẫu phải là WAV PCM 16-bit, mono.");
    const duration=data / (fmt.rate*fmt.channels*(fmt.bits/8));
    if(duration<3||duration>8)throw Error("Mẫu phải dài từ 3 đến 8 giây; thực tế "+duration.toFixed(2)+" s.");
    return duration;
  }
  async function updateReference(){
    const file=$("reference").files[0];
    validatedReference=null;
    if(refUrl)URL.revokeObjectURL(refUrl);
    $("referencePreview").hidden=true;
    if(!file){$("referenceStatus").textContent="Chưa chọn mẫu.";return;}
    try{
      if(file.size>10*1024*1024)throw Error("Mẫu quá 10 MB.");
      const duration=validatePcmWav(await file.arrayBuffer());
      validatedReference=file;
      $("referenceStatus").textContent="Hợp lệ: "+duration.toFixed(2)+" giây · PCM16 mono. Chưa upload lên máy chủ.";
      refUrl=URL.createObjectURL(file);$("referencePreview").src=refUrl;$("referencePreview").hidden=false;
    }catch(e){$("referenceStatus").textContent="Mẫu không hợp lệ: "+e.message;status(e.message,"error");}
  }
  async function clone(){
    const btn=$("cloneButton"), engine=$("engine").value;
    const text=$("ttsText").value.trim(), transcript=$("refText").value.trim();
    if(!text || text.length>2000){status("Nhập văn bản từ 1 đến 2000 ký tự.","error");return;}
    const form=new FormData();
    form.append("engine",engine);
    form.append("text",text);
    if(engine!=="vieneu-preset"){
      if(!validatedReference || !$("consent").checked){status("Cần WAV hợp lệ và quyền sử dụng mẫu.","error");return;}
      form.append("consent","true");
      form.append("reference",validatedReference);
    }
    if(engine==="f5"){
      if(!transcript){status("Nhập bản chép lời mẫu cho F5.","error");return;}
      form.append("ref_text",transcript);
    }
    btn.disabled=true;btn.textContent="Đang tổng hợp…";
    try {
      const res=await fetch(cloudEndpoint()+"/api/tts",{method:"POST",headers:cloudHeaders(),body:form,credentials:"omit",mode:"cors"});
      if(!res.ok)throw Error("HTTP "+res.status+": "+(await res.text()).slice(0,180));
      const blob=await res.blob();if(!blob.type.startsWith("audio/") || blob.size<44)throw Error("Backend không trả về âm thanh.");
      if(cloneUrl)URL.revokeObjectURL(cloneUrl);
      cloneUrl=URL.createObjectURL(blob);
      $("cloneOutput").src=cloneUrl;$("cloneOutput").hidden=false;
      status("Đã tạo tệp giọng đọc cục bộ.","success");
    }catch(e){status("Không gọi được bộ đọc cục bộ: "+e.message+". GitHub Pages không tự chạy Python; kiểm tra HTTPS/CORS/xác thực.","error");}
    finally{btn.disabled=false;btn.textContent="Tạo giọng cục bộ";}
  }

  function cloudEndpoint() {
    const configured=$("backend").value.trim();
    if(!configured) throw Error("Cần nhập URL máy chủ BilaVoice proxy, không nhập https://api.vieneu.io/mcp.");
    const url=new URL(configured);
    if(url.hostname==="api.vieneu.io") throw Error("Trang BilaVoice cần proxy /api/cloud/*, không thể dùng trực tiếp địa chỉ VieNeu MCP/API trong ô backend.");
    const local=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
    if(url.protocol!=="https:" && !(url.protocol==="http:"&&local)) throw Error("Máy chủ phải dùng HTTPS, trừ localhost.");
    if(url.username||url.password||url.search||url.hash) throw Error("URL không được chứa token/mật khẩu hoặc query.");
    return url.origin+url.pathname.replace(/\/$/,"");
  }
  function cloudHeaders() {
    const access=$("cloudToken").value.trim();
    if(!access) throw Error("Cần token truy cập BilaVoice proxy. Không nhập VieNeu API key tại đây.");
    return {"X-BilaVoice-Token":access};
  }
  async function loadCloudVoices() {
    const btn=$("cloudVoicesButton");
    btn.disabled=true;
    try {
      const res=await fetch(cloudEndpoint()+"/api/cloud/voices",{
        method:"GET",headers:cloudHeaders(),credentials:"omit",mode:"cors"
      });
      if(!res.ok) throw Error("HTTP "+res.status+": "+(await res.text()).slice(0,130));
      const data=await res.json();
      if(!Array.isArray(data.voices)) throw Error("Danh sách giọng không hợp lệ.");
      const select=$("cloudVoice");select.textContent="";
      const fallback=document.createElement("option");fallback.value="";fallback.textContent="Giọng mặc định";select.appendChild(fallback);
      for(const v of data.voices) {
        if(typeof v.id!=="string") continue;
        const opt=document.createElement("option");opt.value=v.id;
        opt.textContent=(v.name||v.id)+(v.kind==="cloned"?" · ĐÃ NHÂN BẢN":" · Danh mục");
        select.appendChild(opt);
      }
      status("Đã tải "+data.voices.length+" giọng VieNeu Cloud v4, bao gồm các giọng đã được đăng ký trong tài khoản nếu có.","success");
    }catch(e){status("Không tải được giọng Cloud: "+e.message,"error");}
    finally{btn.disabled=false;}
  }
  async function cloudTts(){
    const btn=$("cloudTtsButton"),text=$("ttsText").value.trim();
    if(!text){status("Cần nhập Unicode để tổng hợp giọng.","error");return;}
    if(text.length>1000||text.split(/\s+/).length>100){status("Demo Cloud giới hạn tối đa 100 từ, 1000 ký tự/lần để phù hợp key thử nghiệm.","error");return;}
    btn.disabled=true;btn.textContent="Đang tổng hợp VieNeu Cloud v4…";
    try{
      const res=await fetch(cloudEndpoint()+"/api/cloud/tts",{
        method:"POST",
        headers:{"Content-Type":"application/json",...cloudHeaders()},
        body:JSON.stringify({text,voice:$("cloudVoice").value}),
        credentials:"omit",mode:"cors"
      });
      if(!res.ok)throw Error("HTTP "+res.status+": "+(await res.text()).slice(0,150));
      const blob=await res.blob();
      if(!blob.size || !blob.type.startsWith("audio/"))throw Error("VieNeu proxy không trả âm thanh.");
      if(cloudUrl)URL.revokeObjectURL(cloudUrl);
      cloudUrl=URL.createObjectURL(blob);
      $("cloudAudio").src=cloudUrl;$("cloudAudio").hidden=false;
      status("Đã tổng hợp giọng bằng VieNeu Cloud v4. Chi phí áp dụng theo gói token VieNeu.","success");
    }catch(e){status("VieNeu Cloud thất bại: "+e.message,"error");}
    finally{btn.disabled=false;btn.textContent="▶ Tạo giọng bằng VieNeu Cloud v4";}
  }
  function generateFsk(){
    try{
      const cvss=$("cvnss").value;
      const symbols=B.packCvss(cvss);
      const duration=(A.frame(symbols).length*A.SPS/A.SR);
      if(duration>45)throw Error("Tín hiệu sẽ dài "+duration.toFixed(1)+" s; bản thử nghiệm giới hạn 45 s. Hãy rút ngắn văn bản.");
      fskSamples=A.synthesize(symbols);
      fskBytes=A.wavBytes(fskSamples);
      if(fskUrl)URL.revokeObjectURL(fskUrl);
      fskUrl=URL.createObjectURL(new Blob([fskBytes],{type:"audio/wav"}));
      $("fskPlayer").src=fskUrl;$("fskPlayer").hidden=false;
      $("decodeFSK").disabled=false;
      $("duration").textContent=duration.toFixed(2)+" s / "+A.frame(symbols).length+" ký hiệu";
      $("crc").textContent="Chưa kiểm tra";$("fskDecoded").textContent="—";
      paintWave(C.charToValue(symbols[0]),fskSamples);
      status("Đã tạo kênh truyền dữ liệu 27-FSK. Sóng này KHÔNG mang âm sắc giọng người.","success");
    }catch(e){status("Không thể tạo 27-FSK: "+e.message,"error");}
  }
  function decodeFsk(){
    try{
      if(!fskBytes)throw Error("Cần tạo WAV trước.");
      const raw=A.decodeWav(fskBytes);
      const decoded=B.unpackCvss(raw.text);
      $("crc").textContent="CRC-16 PASS";
      $("fskDecoded").textContent=decoded;
      status("Đã khôi phục đúng nội dung CVNSS từ WAV số trong điều kiện thử nghiệm không nhiễu. Không suy ra STT/TTS chính xác.","success");
    }catch(e){$("crc").textContent="REJECT";status("Giải mã WAV thất bại: "+e.message,"error");}
  }
  $("encode").addEventListener("click",encode);
  $("decode").addEventListener("click",decode);
  $("copySymbol").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("cvnss").value);status("Đã sao chép CVNSS4.0.","success");}catch(e){status("Không thể sao chép: "+e.message,"error");}});
  $("speak").addEventListener("click",speak);
  $("stopSpeak").addEventListener("click",()=>window.speechSynthesis?.cancel());
  function updateEngine(){
    $("sampleFields").hidden=$("engine").value==="vieneu-preset";
    $("transcriptField").hidden=$("engine").value!=="f5";
  }
  $("engine").addEventListener("change",updateEngine);
  updateEngine();
  $("reference").addEventListener("change",updateReference);
  $("cloneButton").addEventListener("click",clone);
  $("cloudVoicesButton").addEventListener("click",loadCloudVoices);
  $("cloudTtsButton").addEventListener("click",cloudTts);
  $("symbolSlider").addEventListener("input",()=>selectSymbol(Number($("symbolSlider").value)));
  $("generateFSK").addEventListener("click",generateFsk);
  $("decodeFSK").addEventListener("click",decodeFsk);
  if(!C||!A||!B||!window.CVNSSConverter){status("Thiếu mã lõi CVNSS / Ring-108.","error");return;}
  if(["localhost","127.0.0.1"].includes(window.location.hostname) && window.location.port==="8000") $("backend").value=window.location.origin;
  selectSymbol(0);loadVoices();
  if(window.speechSynthesis)window.speechSynthesis.onvoiceschanged=loadVoices;
  setupSpeechRecognition();encode();
})();
