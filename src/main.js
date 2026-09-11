// ============================================================================
// WebAR Main Coordinator (Three.js & 8th Wall Engine Binary)
// Qu?n l� kh?i d?ng Engine v� di?u ph?i c�c module d?c l?p:
// 1. video-target.js -> Qu�t ?nh GOSU -> Ph�t Video 16:9
// 2. camel-target.js -> Qu�t ?nh SROM -> Hi?n L?c �� 3D (t_camel_stand)
// ============================================================================

const video = document.getElementById('ar-video')
window.isMuted = true
const hudTitle = document.getElementById('hud-status')
const hudDetail = document.getElementById('hud-detail')
const soundBtn = document.getElementById('sound-btn')
const soundIcon = document.getElementById('sound-icon')
const soundText = document.getElementById('sound-text')
const previewTargetBtn = document.getElementById('preview-target-btn')
const targetModal = document.getElementById('target-modal')
const closeModalBtn = document.getElementById('close-modal-btn')

// N�t chuy?n d?i ?nh m?u trong popup
const tabGosu = document.getElementById('tab-gosu')
const tabSrom = document.getElementById('tab-srom')
const modalImg = document.getElementById('modal-img')

if (tabGosu && tabSrom && modalImg) {
  tabGosu.addEventListener('click', () => {
    tabGosu.classList.add('active')
    tabSrom.classList.remove('active')
    modalImg.src = './assets/gosu.jpg'
  })
  tabSrom.addEventListener('click', () => {
    tabSrom.classList.add('active')
    tabGosu.classList.remove('active')
    modalImg.src = './assets/srom.jpg'
  })

const tabChess = document.getElementById('tab-chess')
if (tabChess && modalImg) {
  tabChess.addEventListener('click', () => {
    if (tabGosu) tabGosu.classList.remove('active')
    if (tabSrom) tabSrom.classList.remove('active')
    tabChess.classList.add('active')
    modalImg.src = './assets/chess.jpg'
  })
}
if (tabGosu) {
  tabGosu.addEventListener('click', () => {
    if (tabChess) tabChess.classList.remove('active')
  })
}
if (tabSrom) {
  tabSrom.addEventListener('click', () => {
    if (tabChess) tabChess.classList.remove('active')
  })
}
}

// Qu?n l� tr?ng th�i �m thanh
let isMuted = true
if (soundBtn) {
  soundBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    isMuted = !isMuted
    window.isMuted = isMuted
    if (video) video.muted = isMuted
    if (isMuted) {
      soundIcon.innerText = '??'
      soundText.innerText = 'B?t �m Thanh'
      soundBtn.classList.remove('active')
    } else {
      soundIcon.innerText = '??'
      soundText.innerText = 'T?t �m Thanh'
      soundBtn.classList.add('active')
      if (video) video.play().catch(() => {})
    }
  })
}

// M? / ��ng modal xem ?nh m?u
if (previewTargetBtn && targetModal) {
  previewTargetBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    targetModal.style.display = 'flex'
    if (video && !video.paused) {
      video.pause()
    }
  })
}
if (closeModalBtn && targetModal) {
  closeModalBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    targetModal.style.display = 'none'
  })
}
if (targetModal) {
  targetModal.addEventListener('click', (e) => {
    if (e.target === targetModal) targetModal.style.display = 'none'
  })
}

// M? kh�a autoplay tr�n mobile khi ngu?i d�ng ch?m m�n h�nh
const unlockMedia = () => {
  if (video && video.paused) {
    video.muted = (typeof window.isMuted !== 'undefined') ? window.isMuted : true
    video.play().then(() => {
      const hudDetail = document.getElementById('hud-detail')
      if (hudDetail && hudDetail.innerText.includes('Chạm')) {
        hudDetail.innerText = 'Đang phát Video 16:9 Widescreen trên bề mặt ảnh'
      }
    }).catch(() => {})
  }
}
['touchstart', 'touchend', 'click', 'pointerdown'].forEach((evt) => {
  window.addEventListener(evt, unlockMedia, { passive: true })
})

// ============================================================================
// Kh?i ch?y 8th Wall Engine & �ang k� c�c Module AR
// ============================================================================
const onxrloaded = async () => {
  try {
    if (hudTitle) hudTitle.innerText = '⏳ ĐANG TẢI DỮ LIỆU AR...'
    if (hudDetail) hudDetail.innerText = 'Đang nạp thuật toán và metadata ảnh...'

    // Nạp metadata của cả gosu.json, srom.json và target.json dự phòng
    const targets = []
    
    try {
      const gosuData = await fetch('./image-targets/gosu.json?t=' + Date.now()).then((r) => r.json())
      gosuData.imagePath = new URL('./image-targets/gosu_luminance.jpg', window.location.href).href
      targets.push(gosuData)
    } catch (e) {}

    try {
      const sromData = await fetch('./image-targets/srom.json?t=' + Date.now()).then((r) => r.json())
      sromData.imagePath = new URL('./image-targets/srom_luminance.jpg', window.location.href).href
      targets.push(sromData)
    } catch (e) {}

    try {
      const targetData = await fetch('./image-targets/target.json?t=' + Date.now()).then((r) => r.json())
      targetData.imagePath = new URL('./image-targets/target_luminance.jpg', window.location.href).href
      targets.push(targetData)
    } catch (e) {}

    try {
      const chessData = await fetch('./image-targets/chess.json?t=' + Date.now()).then((r) => r.json())
      chessData.imagePath = new URL('./image-targets/chess_luminance.jpg', window.location.href).href
      targets.push(chessData)
    } catch (e) {
      console.error('Error loading chess.json:', e)
    }

    if (!window.XR8 || !XR8.XrController) {
      throw new Error('Engine XR8 chưa khởi tạo xong XrController. Vui lòng kiểm tra lại kết nối mạng.')
    }

    console.log('[Main] Khởi tạo đa mục tiêu (Multi-targets):', targets.map(t => t.name))

    // Cấu hình đồng thời các target vào 8th Wall
    XR8.XrController.configure({
      disableWorldTracking: true,
      imageTargetData: targets,
    })

    // Thêm các modules vào camera pipeline
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      createVideoTargetModule(),
      createCamelTargetModule(),
      createChessTargetModule(),
    ])

    const canvas = document.getElementById('camerafeed')
    XR8.run({ canvas })

    if (hudTitle) hudTitle.innerText = '🔔 HÃY HƯỚNG CAMERA VÀO TẤM ẢNH'
    if (hudDetail) hudDetail.innerText = 'Quét ảnh GOSU để xem Video hoặc ảnh SROM để xem Lạc Đà 3D'

  } catch (err) {
    console.error('Lỗi khi nạp Image Target:', err)
    if (hudTitle) hudTitle.innerText = '❌ LỖI KHỞI ĐỘNG'
    if (hudDetail) hudDetail.innerText = err.message || 'Không thể tải metadata ảnh mục tiêu'
  }
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)

// Test Helper: Tự động kích hoạt chess nếu có ?test_chess trên URL
if (window.location.search.includes('test_chess')) {
  setTimeout(() => {
    console.log('[TestHarness] Tự động kích hoạt hiển thị bàn cờ Chess');
    if (typeof THREE !== 'undefined') {
      window.dispatchEvent(new CustomEvent('reality.imagefound', {
        detail: {
          name: 'chess',
          position: new THREE.Vector3(0, 0, -1.2),
          rotation: new THREE.Quaternion(0, 0, 0, 1),
          scale: 1,
        }
      }));
    }
  }, 2500);
}
