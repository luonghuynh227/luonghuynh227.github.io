// ============================================================================
// MODULE: 3D Model AR Target (Xử lý ảnh srom.jpg & chú lạc đà camel.glb)
// Tính năng nâng cấp:
// AI Tự do di chuyển ngẫu nhiên trên bề mặt ảnh SROM:
// - Đứng nghỉ (t_camel_stand)
// - Đi dạo thong thả (t_camel_walk)
// - Phi nước đại chạy nhanh (t_camel_run)
// - Tự động đổi hướng di chuyển, quay đầu khi chạm mép ảnh
// - Nút tương tác trên HUD để chuyển đổi chế độ Tự Do <-> Đứng Yên
// ============================================================================

const createCamelTargetModule = () => {
  let targetRoot = null
  let camelContainer = null
  let camelModel = null
  let territoryRing = null
  let mixer = null

  // Các Animation Action
  let standAction = null
  let walkAction = null
  let runAction = null
  let currentAction = null

  let clock = new THREE.Clock()

  // Các trạng thái AI của Lạc Đà
  const STATE_STAND = 'STAND'
  const STATE_WALK = 'WALK'
  const STATE_RUN = 'RUN'

  let currentState = STATE_STAND
  let isAutoRoaming = true   // Mặc định bật chế độ AI tự do ngẫu nhiên
  let stateTimer = 0         // Đếm thời gian trong trạng thái hiện tại
  let stateDuration = 3.0    // Thời lượng của trạng thái hiện tại

  // Tọa độ và hướng di chuyển
  let posX = 0
  let posY = 0
  let currentAngle = 0
  let targetAngle = 0
  let targetDestX = 0
  let targetDestY = 0

  // Giới hạn vùng di chuyển trên bề mặt ảnh (~26cm bán kính)
  const ROAM_RADIUS = 0.25
  const CAMEL_SCALE = 0.015

  // Tốc độ di chuyển theo trạng thái
  const SPEED_WALK = 0.085  // ~8.5 cm/s
  const SPEED_RUN = 0.22    // ~22 cm/s (chạy nhanh hào hứng)

  // Elements UI
  const camelWalkBtn = document.getElementById('camel-walk-btn')
  const camelWalkIcon = document.getElementById('camel-walk-icon')
  const camelWalkText = document.getElementById('camel-walk-text')

  // Hàm chọn điểm đến ngẫu nhiên bên trong phạm vi ảnh
  const pickNewDestination = () => {
    const r = Math.sqrt(Math.random()) * (ROAM_RADIUS * 0.85)
    const angle = Math.random() * Math.PI * 2
    targetDestX = r * Math.cos(angle)
    targetDestY = r * Math.sin(angle)
    targetAngle = Math.atan2(targetDestY - posY, targetDestX - posX)
  }

  // Hàm chuyển đổi mượt mà giữa các animation
  const switchAnimation = (newAction, fadeDuration = 0.35) => {
    if (!newAction || currentAction === newAction) return
    newAction.reset()
    newAction.setEffectiveTimeScale(1.0)
    newAction.setEffectiveWeight(1.0)
    if (currentAction) {
      newAction.crossFadeFrom(currentAction, fadeDuration, true)
    }
    newAction.play()
    currentAction = newAction
  }

  // Hàm chuyển trạng thái FSM (Finite State Machine)
  const setCamelState = (newState, customDuration = null) => {
    currentState = newState
    stateTimer = 0

    const hudTitle = document.getElementById('hud-status')
    const hudDetail = document.getElementById('hud-detail')

    if (newState === STATE_STAND) {
      stateDuration = customDuration || (2.5 + Math.random() * 3.0) // 2.5 - 5.5 giây
      switchAnimation(standAction, 0.4)
      if (hudTitle && targetRoot && targetRoot.visible) hudTitle.innerText = '🐪 LẠC ĐÀ ĐANG ĐỨNG NGHỈ...'
      if (hudDetail && targetRoot && targetRoot.visible) hudDetail.innerText = 'Đang phát animation t_camel_stand'
    } else if (newState === STATE_WALK) {
      stateDuration = customDuration || (3.5 + Math.random() * 3.5) // 3.5 - 7.0 giây
      pickNewDestination()
      switchAnimation(walkAction, 0.35)
      if (hudTitle && targetRoot && targetRoot.visible) hudTitle.innerText = '🚶 LẠC ĐÀ ĐANG ĐI DẠO...'
      if (hudDetail && targetRoot && targetRoot.visible) hudDetail.innerText = 'Đang bước đi thong thả (t_camel_walk)'
    } else if (newState === STATE_RUN) {
      stateDuration = customDuration || (2.5 + Math.random() * 2.5) // 2.5 - 5.0 giây
      pickNewDestination()
      switchAnimation(runAction, 0.3)
      if (hudTitle && targetRoot && targetRoot.visible) hudTitle.innerText = '⚡ LẠC ĐÀ ĐANG PHI NƯỚC ĐẠI!'
      if (hudDetail && targetRoot && targetRoot.visible) hudDetail.innerText = 'Đang chạy nhanh ngẫu nhiên (t_camel_run)'
    }
  }

  // Chọn trạng thái kế tiếp ngẫu nhiên thông minh
  const pickNextRandomState = () => {
    const roll = Math.random()
    if (currentState === STATE_STAND) {
      // Khi đang đứng: 65% đi dạo, 35% chạy nhanh
      if (roll < 0.65) setCamelState(STATE_WALK)
      else setCamelState(STATE_RUN)
    } else if (currentState === STATE_WALK) {
      // Khi đang đi: 40% dừng đứng, 35% đi tiếp điểm khác, 25% tăng tốc chạy
      if (roll < 0.40) setCamelState(STATE_STAND)
      else if (roll < 0.75) setCamelState(STATE_WALK)
      else setCamelState(STATE_RUN)
    } else if (currentState === STATE_RUN) {
      // Khi đang chạy: 60% giảm tốc đi bộ, 40% dừng lại thở
      if (roll < 0.60) setCamelState(STATE_WALK)
      else setCamelState(STATE_STAND)
    }
  }

  // Bật/Tắt chế độ Tự do di chuyển (Roam AI)
  const toggleRoaming = () => {
    isAutoRoaming = !isAutoRoaming
    if (isAutoRoaming) {
      if (camelWalkIcon) camelWalkIcon.innerText = '🛑'
      if (camelWalkText) camelWalkText.innerText = 'Cho Lạc Đà Đứng Lại'
      if (camelWalkBtn) camelWalkBtn.classList.add('walking')
      pickNextRandomState()
    } else {
      if (camelWalkIcon) camelWalkIcon.innerText = '🐪'
      if (camelWalkText) camelWalkText.innerText = 'Bật Tự Do Đi & Chạy'
      if (camelWalkBtn) camelWalkBtn.classList.remove('walking')
      setCamelState(STATE_STAND, 999999)
    }
  }

  if (camelWalkBtn) {
    camelWalkBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleRoaming()
    })
  }

  const showCamel = (detail) => {
    if (!detail) return
    targetRoot.visible = true

    if (detail.position) targetRoot.position.copy(detail.position)
    if (detail.rotation) targetRoot.quaternion.copy(detail.rotation)
    if (detail.scale) {
      targetRoot.scale.set(detail.scale, detail.scale, detail.scale)
    }

    // Hiển thị nút điều khiển lạc đà trên HUD
    const soundBtn = document.getElementById('sound-btn')
    if (soundBtn) soundBtn.style.display = 'none'
    if (camelWalkBtn) {
      camelWalkBtn.style.display = 'inline-flex'
      if (isAutoRoaming) {
        if (camelWalkIcon) camelWalkIcon.innerText = '🛑'
        if (camelWalkText) camelWalkText.innerText = 'Cho Lạc Đà Đứng Lại'
        if (camelWalkBtn) camelWalkBtn.classList.add('walking')
      } else {
        if (camelWalkIcon) camelWalkIcon.innerText = '🐪'
        if (camelWalkText) camelWalkText.innerText = 'Bật Tự Do Đi & Chạy'
        if (camelWalkBtn) camelWalkBtn.classList.remove('walking')
      }
    }

    const hudDot = document.getElementById('hud-dot')
    const hudTitle = document.getElementById('hud-status')
    const hudDetail = document.getElementById('hud-detail')

    if (hudDot) hudDot.className = 'hud-indicator found'
    if (currentState === STATE_RUN) {
      if (hudTitle) hudTitle.innerText = '⚡ LẠC ĐÀ ĐANG PHI NƯỚC ĐẠI!'
      if (hudDetail) hudDetail.innerText = 'Đang chạy nhanh ngẫu nhiên (t_camel_run)'
    } else if (currentState === STATE_WALK) {
      if (hudTitle) hudTitle.innerText = '🚶 LẠC ĐÀ ĐANG ĐI DẠO...'
      if (hudDetail) hudDetail.innerText = 'Đang bước đi thong thả (t_camel_walk)'
    } else {
      if (hudTitle) hudTitle.innerText = '🐪 ĐÃ TÌM THẤY ẢNH SROM!'
      if (hudDetail) hudDetail.innerText = 'Lạc đà 3D đang hoạt động tự do ngẫu nhiên'
    }
  }

  const hideCamel = () => {
    if (!targetRoot) return
    console.log('[CamelModule] Target lost')
    targetRoot.visible = false

    if (camelWalkBtn) camelWalkBtn.style.display = 'none'

    const hudDot = document.getElementById('hud-dot')
    const hudTitle = document.getElementById('hud-status')
    const hudDetail = document.getElementById('hud-detail')

    if (hudDot) hudDot.className = 'hud-indicator lost'
    if (hudTitle) hudTitle.innerText = '🔔 ĐÃ MẤT DẤU ẢNH SROM'
    if (hudDetail) hudDetail.innerText = 'Hãy hướng camera lại gần tấm ảnh srom.jpg'
  }

  return {
    name: 'camel-target-pipeline-module',

    onStart: () => {
      console.log('[CamelModule] Starting Three.js 3D Model Scene...')
      const { scene } = XR8.Threejs.xrScene()

      // Ánh sáng chiếu Studio 3D
      const ambientLight = new THREE.AmbientLight(0xffffff, 2.5)
      scene.add(ambientLight)

      const mainLight = new THREE.DirectionalLight(0xffffff, 3.0)
      mainLight.position.set(3, 5, 6)
      scene.add(mainLight)

      const fillLight = new THREE.DirectionalLight(0xffeedd, 2.0)
      fillLight.position.set(-3, -2, 5)
      scene.add(fillLight)

      targetRoot = new THREE.Group()
      targetRoot.visible = false
      scene.add(targetRoot)

      // Vòng tròn Hologram giới hạn lãnh thổ di chuyển tự do (~26cm)
      const ringGeo = new THREE.RingGeometry(ROAM_RADIUS - 0.005, ROAM_RADIUS + 0.005, 64)
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
      })
      territoryRing = new THREE.Mesh(ringGeo, ringMat)
      territoryRing.position.z = 0.002
      targetRoot.add(territoryRing)

      // Bệ trung tâm
      const centerGeo = new THREE.RingGeometry(0.04, 0.06, 32)
      const centerMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      })
      const centerDisc = new THREE.Mesh(centerGeo, centerMat)
      centerDisc.position.z = 0.002
      targetRoot.add(centerDisc)

      // Container di chuyển và xoay hướng lạc đà
      camelContainer = new THREE.Group()
      camelContainer.position.set(0, 0, 0.005)
      targetRoot.add(camelContainer)

      // Tải mô hình 3D camel.glb
      const loader = new THREE.GLTFLoader()
      console.log('[CamelModule] Loading 3D model ./assets/camel.glb...')

      loader.load(
        './assets/camel.glb',
        (gltf) => {
          camelModel = gltf.scene
          console.log('[CamelModule] camel.glb loaded successfully!', gltf)

          camelModel.traverse((child) => {
            if (child.isMesh || child.isSkinnedMesh) {
              child.frustumCulled = false
              if (child.material) {
                child.material.side = THREE.DoubleSide
                child.material.needsUpdate = true
              }
            }
          })

          camelModel.scale.set(CAMEL_SCALE, CAMEL_SCALE, CAMEL_SCALE)
          camelModel.rotation.x = Math.PI / 2
          camelModel.rotation.y = 0
          camelModel.position.set(-2.3 * CAMEL_SCALE, 0, 0)
          camelContainer.add(camelModel)

          // Khởi tạo Mixer và nạp CẢ 3 ANIMATION: Stand, Walk, Run
          if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(camelModel)

            // 1. t_camel_stand
            const standClip = gltf.animations.find(
              (a) => a.name === 't_camel_stand' || a.name === 't_camel_stand.001'
            ) || gltf.animations[0]
            standAction = mixer.clipAction(standClip)
            standAction.setLoop(THREE.LoopRepeat)

            // 2. t_camel_walk
            const walkClip = gltf.animations.find(
              (a) => a.name === 't_camel_walk' || a.name === 't_camel_walk.001'
            )
            if (walkClip) {
              walkAction = mixer.clipAction(walkClip)
              walkAction.setLoop(THREE.LoopRepeat)
            } else {
              walkAction = standAction
            }

            // 3. t_camel_run
            const runClip = gltf.animations.find(
              (a) => a.name === 't_camel_run' || a.name === 't_camel_run.001'
            )
            if (runClip) {
              runAction = mixer.clipAction(runClip)
              runAction.setLoop(THREE.LoopRepeat)
              console.log('[CamelModule] Loaded running animation:', runClip.name)
            } else {
              console.warn('[CamelModule] t_camel_run not found, fallback to walk')
              runAction = walkAction
            }

            // Bắt đầu bằng hành vi đứng nghỉ
            currentAction = standAction
            standAction.play()
            setCamelState(STATE_STAND, 2.5)
          }

          console.log('[CamelModule] Camel setup completed with Stand, Walk, Run!')
        },
        null,
        (error) => console.error('[CamelModule] Error loading camel.glb:', error)
      )
    },

    listeners: [
      {
        event: 'reality.imagefound',
        process: ({ detail }) => {
          if (detail.name === 'srom') showCamel(detail)
        },
      },
      {
        event: 'reality.imageupdated',
        process: ({ detail }) => {
          if (detail.name === 'srom') showCamel(detail)
        },
      },
      {
        event: 'reality.imagelost',
        process: ({ detail }) => {
          if (detail.name === 'srom') hideCamel()
        },
      },
    ],

    onUpdate: () => {
      const delta = clock.getDelta()

      if (mixer) mixer.update(delta)

      if (camelContainer && targetRoot && targetRoot.visible && isAutoRoaming) {
        stateTimer += delta

        // Kiểm tra hết thời gian trạng thái để đổi hành vi ngẫu nhiên
        if (stateTimer >= stateDuration) {
          pickNextRandomState()
        }

        // Xử lý di chuyển khi đang WALK hoặc RUN
        if (currentState === STATE_WALK || currentState === STATE_RUN) {
          const speed = (currentState === STATE_RUN) ? SPEED_RUN : SPEED_WALK

          // Vector tới đích
          const dx = targetDestX - posX
          const dy = targetDestY - posY
          const dist = Math.hypot(dx, dy)

          // Nếu đến gần điểm đích (< 3cm) thì chọn ngay trạng thái/điểm đến tiếp theo
          if (dist < 0.03) {
            pickNextRandomState()
          } else {
            // Tính góc hướng về điểm đến
            targetAngle = Math.atan2(dy, dx)

            // Xoay mượt đầu lạc đà về hướng di chuyển (shortest angle interpolation)
            const angleDiff = Math.atan2(Math.sin(targetAngle - currentAngle), Math.cos(targetAngle - currentAngle))
            const turnSpeed = (currentState === STATE_RUN) ? 4.5 : 3.0
            currentAngle += angleDiff * Math.min(1.0, turnSpeed * delta)

            // Di chuyển tịnh tiến
            posX += Math.cos(currentAngle) * speed * delta
            posY += Math.sin(currentAngle) * speed * delta

            // Kiểm tra ranh giới an toàn: nếu chạm mép vòng tròn thì bẻ hướng quay về tâm (0,0)
            const distFromCenter = Math.hypot(posX, posY)
            if (distFromCenter > ROAM_RADIUS) {
              targetDestX = 0
              targetDestY = 0
              targetAngle = Math.atan2(-posY, -posX)
            }

            camelContainer.position.set(posX, posY, 0.005)
            camelContainer.rotation.z = currentAngle
          }

          // Hiệu ứng phát sáng vòng lãnh thổ khi di chuyển
          if (territoryRing) {
            territoryRing.material.opacity = 0.35 + Math.sin(performance.now() * 0.004) * 0.15
          }
        } else {
          // Khi đứng yên (STATE_STAND): giữ nguyên vị trí, thở tại chỗ
          camelContainer.position.set(posX, posY, 0.005)
          if (territoryRing) {
            territoryRing.material.opacity = 0.25
          }
        }
      }
    },
  }
}
