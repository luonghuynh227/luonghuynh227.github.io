// ============================================================================
// MODULE: Video AR Target (Xử lý ảnh GOSU & video.mp4)
// Tách riêng để dễ debug và tùy biến độc lập
// ============================================================================
const sourceVideo = './assets/video.mp4'
const createVideoTargetModule = () => {
  const video = document.getElementById('ar-video')
  if (video) {
    video.muted = true
    video.defaultMuted = true
    video.volume = 1.0 // Giữ volume 1.0 (Android cần volume > 0 để phát được âm thanh khi unmute)
    video.playsInline = true
    video.crossOrigin = 'anonymous'
  }
  let targetRoot = null
  let videoMesh = null
  let borderLines = null
  let videoTexture = null
  let currentVideoSrc = ''

  // Bảng mapping video theo từng Target (dễ dàng mở rộng cho 5 - 10 video khác nhau)
  const targetMediaMap = {
    gosu: sourceVideo,
    target: sourceVideo,
  }

  const showVideo = (detail) => {
    if (!detail) return
    console.log('[VideoModule] Target found:', detail.name)

    targetRoot.visible = true

    if (detail.position) targetRoot.position.copy(detail.position)
    if (detail.rotation) targetRoot.quaternion.copy(detail.rotation)
    if (detail.scale) {
      targetRoot.scale.set(detail.scale, detail.scale, detail.scale)
    }

    // 1. LAZY LOAD: Chỉ nạp video khi thực sự quét trúng tấm ảnh tương ứng!
    const targetSrc = targetMediaMap[detail.name] || sourceVideo
    const fullTargetUrl = new URL(targetSrc, window.location.href).href

    if (video.src !== fullTargetUrl) {
      console.log('[VideoModule] Lazy-loading video on demand:', targetSrc)
      currentVideoSrc = targetSrc
      video.src = targetSrc
      video.load()
    }

    // 2. Tỉ lệ tự nhiên của Video (16:9 = 1.7778)
    const videoAspect = (video.videoWidth && video.videoHeight)
      ? (video.videoWidth / video.videoHeight)
      : (16 / 9)

    const width = 1.0
    const height = width / videoAspect

    videoMesh.scale.set(width, height, 1)
    borderLines.scale.set(width * 1.02, height * 1.02, 1)

    // 3. Tự động phát video (Hỗ trợ chuẩn cả Android và iOS)
    const isMutedState = (typeof window.isMuted !== 'undefined') ? window.isMuted : true
    video.muted = isMutedState
    if (isMutedState) {
      video.setAttribute('muted', '')
    } else {
      video.removeAttribute('muted')
      video.volume = 1.0
    }

    if (video.paused) {
      const p = video.play()
      if (p !== undefined) {
        p.catch((err) => {
          console.log('[VideoModule] Play pending user interaction:', err)
        })
      }
    }

    // Cập nhật giao diện HUD
    const soundBtn = document.getElementById('sound-btn')
    const camelWalkBtn = document.getElementById('camel-walk-btn')
    if (soundBtn) soundBtn.style.display = 'inline-flex'
    if (camelWalkBtn) camelWalkBtn.style.display = 'none'

    const hudDot = document.getElementById('hud-dot')
    const hudTitle = document.getElementById('hud-status')
    const hudDetail = document.getElementById('hud-detail')

    if (hudDot) hudDot.className = 'hud-indicator found'
    if (hudTitle) hudTitle.innerText = '✅ ĐÃ TÌM THẤY ẢNH GOSU!'

    if (video.paused) {
      if (hudDetail) hudDetail.innerText = '👉 Chạm nhẹ vào màn hình nếu video chưa chạy'
    } else {
      if (hudDetail) hudDetail.innerText = 'Đang phát Video 16:9 Widescreen trên bề mặt ảnh'
    }
  }

  const hideVideo = () => {
    if (!targetRoot) return
    console.log('[VideoModule] Target lost -> Tạm dừng video và ẩn giao diện')
    targetRoot.visible = false

    // 1. DỪNG PHÁT VIDEO & TẮT ÂM THANH NGAY KHI RỜI CAMERA KHỎI ẢNH GOSU
    if (video && !video.paused) {
      video.pause()
    }

    // 2. Ẩn nút âm thanh trên thanh công cụ HUD
    const soundBtn = document.getElementById('sound-btn')
    if (soundBtn) soundBtn.style.display = 'none'

    const hudDot = document.getElementById('hud-dot')
    const hudTitle = document.getElementById('hud-status')
    const hudDetail = document.getElementById('hud-detail')

    if (hudDot) hudDot.className = 'hud-indicator lost'
    if (hudTitle) hudTitle.innerText = '🔔 ĐÃ MẤT DẤU ẢNH GOSU'
    if (hudDetail) hudDetail.innerText = 'Hãy hướng camera lại gần tấm ảnh'
  }

  return {
    name: 'video-target-pipeline-module',

    onStart: () => {
      console.log('[VideoModule] Starting Three.js Video Scene...')
      const { scene } = XR8.Threejs.xrScene()

      targetRoot = new THREE.Group()
      targetRoot.visible = false
      scene.add(targetRoot)

      // Khởi tạo Video Texture
      videoTexture = new THREE.VideoTexture(video)
      videoTexture.minFilter = THREE.LinearFilter
      videoTexture.magFilter = THREE.LinearFilter

      // Mặt phẳng chứa Video (nằm trên bề mặt ảnh)
      const planeGeo = new THREE.PlaneGeometry(1, 1)
      const planeMat = new THREE.MeshBasicMaterial({
        map: videoTexture,
        side: THREE.DoubleSide,
        transparent: true,
      })
      videoMesh = new THREE.Mesh(planeGeo, planeMat)
      videoMesh.position.z = 0.005
      targetRoot.add(videoMesh)

      // Khung viền Hologram Cyberpunk phát sáng bao quanh video
      const borderGeo = new THREE.BufferGeometry()
      const borderVertices = new Float32Array([
        -0.5, -0.5, 0.008, 0.5, -0.5, 0.008,
        0.5, -0.5, 0.008, 0.5, 0.5, 0.008,
        0.5, 0.5, 0.008, -0.5, 0.5, 0.008,
        -0.5, 0.5, 0.008, -0.5, -0.5, 0.008,
      ])
      borderGeo.setAttribute('position', new THREE.BufferAttribute(borderVertices, 3))
      const borderMat = new THREE.LineBasicMaterial({
        color: 0x00f0ff,
        linewidth: 3,
        transparent: true,
        opacity: 0.85,
      })
      borderLines = new THREE.LineSegments(borderGeo, borderMat)
      targetRoot.add(borderLines)
    },

    listeners: [
      {
        event: 'reality.imagefound',
        process: ({ detail }) => {
          if (detail.name === 'gosu' || detail.name === 'target') {
            showVideo(detail)
          } else {
            // Khi camera chuyển sang quét trúng ảnh khác (Lạc Đà SROM, Cờ Vua Chess...)
            // Lập tức tạm dừng video GOSU và ẩn khung video
            if (video && !video.paused) {
              video.pause()
            }
            if (targetRoot) targetRoot.visible = false
            const soundBtn = document.getElementById('sound-btn')
            if (soundBtn) soundBtn.style.display = 'none'
          }
        },
      },
      {
        event: 'reality.imageupdated',
        process: ({ detail }) => {
          if (detail.name === 'gosu' || detail.name === 'target') {
            showVideo(detail)
          }
        },
      },
      {
        event: 'reality.imagelost',
        process: ({ detail }) => {
          if (detail.name === 'gosu' || detail.name === 'target') {
            hideVideo()
          }
        },
      },
    ],

    onUpdate: () => {
      if (videoTexture && targetRoot && targetRoot.visible) {
        videoTexture.needsUpdate = true
      }
      if (borderLines && borderLines.material) {
        const time = performance.now() * 0.003
        borderLines.material.opacity = 0.6 + Math.sin(time) * 0.35
      }
    },
  }
}
