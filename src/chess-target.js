// ============================================================================
// MODULE: Chess AR Target (Đánh cờ vua đấu với Máy tính trên ảnh chess.jpg)
// Cải tiến hệ thống logic & tương tác cờ vua Three.js 3D:
// - Đồng bộ quân cờ 100% không bị mất quân ngẫu nhiên (sửa lỗi xóa nhầm Mesh khi duyệt hàng)
// - Hỗ trợ đầy đủ Nhập thành (Castling), Bắt tốt qua đường (En Passant), Phong Hậu (Promotion)
// - Khắc phục triệt để mất gợi ý nước đi, tự động cảnh báo khi quân bị cản/ghim bảo vệ Vua
// - AI Minimax 3 cấp độ (Dễ, Vừa, Khó) bọc try-catch-finally không bao giờ bị đơ
// - Cơ chế Raycasting phân lớp chính xác trên cả Mobile (Touch) và Desktop (Click)
// ============================================================================

const createChessTargetModule = () => {
  let targetRoot = new THREE.Group()
  targetRoot.visible = false
  let boardRoot = null
  let pieceGroup = null
  let highlightGroup = null
  let raycaster = new THREE.Raycaster()
  let mouse = new THREE.Vector2()
  let camera = null

  // Khởi tạo Game Chess logic
  const ChessClass = window.Chess || (typeof Chess !== 'undefined' ? Chess : null)
  let game = ChessClass ? new ChessClass() : null

  // Kích thước bàn cờ (36cm x 36cm)
  const BOARD_SIZE = 0.36
  const SQUARE_SIZE = BOARD_SIZE / 8
  const HALF_BOARD = BOARD_SIZE / 2

  // Quản lý quân cờ và animation
  const pieceMeshes = {}   // square -> Mesh/Group (vd: 'e2' -> Mesh)
  let selectedSquare = null
  let validMoveSquares = []
  let movingPieces = []

  // Cấu hình độ khó AI
  let currentDifficulty = 'medium'
  let isAiThinking = false
  let isGameOver = false
  let lastTapTime = 0

  // ============================================================================
  // WEB AUDIO SYNTHESIZER CHO HIỆU ỨNG ÂM THANH CỜ VUA
  // ============================================================================
  let audioCtx = null
  const initAudio = () => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (audioCtx.state === 'suspended') audioCtx.resume()
  }

  const playSound = (type) => {
    try {
      initAudio()
      if (!audioCtx) return
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      const now = audioCtx.currentTime

      if (type === 'select') {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(520, now)
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.05)
        gain.gain.setValueAtTime(0.25, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05)
        osc.start(now)
        osc.stop(now + 0.05)
      } else if (type === 'move') {
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(320, now)
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.08)
        gain.gain.setValueAtTime(0.35, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08)
        osc.start(now)
        osc.stop(now + 0.08)
      } else if (type === 'capture') {
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(450, now)
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.12)
        gain.gain.setValueAtTime(0.45, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12)
        osc.start(now)
        osc.stop(now + 0.12)
      } else if (type === 'check') {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(660, now)
        osc.frequency.setValueAtTime(880, now + 0.1)
        gain.gain.setValueAtTime(0.4, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
        osc.start(now)
        osc.stop(now + 0.25)
      } else if (type === 'win') {
        osc.type = 'sine'
        osc.frequency.setValueAtTime(440, now)
        osc.frequency.setValueAtTime(554.37, now + 0.12)
        osc.frequency.setValueAtTime(659.25, now + 0.24)
        gain.gain.setValueAtTime(0.4, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5)
        osc.start(now)
        osc.stop(now + 0.5)
      }
    } catch (e) {}
  }

  // Tọa độ 3D từ tên ô (vd: 'e4')
  const squareToCoords = (sq) => {
    if (!sq || sq.length < 2) return { x: 0, y: 0 }
    const file = sq.charCodeAt(0) - 97 // 'a' -> 0, 'h' -> 7
    const rank = parseInt(sq[1], 10) - 1 // '1' -> 0, '8' -> 7
    const x = (file - 3.5) * SQUARE_SIZE
    const y = (rank - 3.5) * SQUARE_SIZE
    return { x, y }
  }

  // Tọa độ 3D Local sang tên ô
  const coordsToSquare = (localX, localY) => {
    const file = Math.floor((localX + HALF_BOARD) / SQUARE_SIZE)
    const rank = Math.floor((localY + HALF_BOARD) / SQUARE_SIZE)
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null
    return String.fromCharCode(97 + file) + (rank + 1)
  }

  // ============================================================================
  // TẠO HÌNH CÁC QUÂN CỜ 3D CHUẨN ĐẸP
  // ============================================================================
  const createPieceGeometry = (type) => {
    const group = new THREE.Group()

    // Đế tròn chung
    const baseGeo = new THREE.CylinderGeometry(0.017, 0.019, 0.007, 24)
    const base = new THREE.Mesh(baseGeo)
    base.position.y = 0.0035
    group.add(base)

    if (type === 'p') {
      // TỐT
      const bodyGeo = new THREE.CylinderGeometry(0.009, 0.014, 0.020, 16)
      const body = new THREE.Mesh(bodyGeo)
      body.position.y = 0.015
      group.add(body)

      const headGeo = new THREE.SphereGeometry(0.0095, 16, 16)
      const head = new THREE.Mesh(headGeo)
      head.position.y = 0.028
      group.add(head)
    } else if (type === 'r') {
      // XE
      const bodyGeo = new THREE.CylinderGeometry(0.012, 0.015, 0.026, 16)
      const body = new THREE.Mesh(bodyGeo)
      body.position.y = 0.018
      group.add(body)

      const topGeo = new THREE.CylinderGeometry(0.014, 0.012, 0.009, 16)
      const top = new THREE.Mesh(topGeo)
      top.position.y = 0.033
      group.add(top)
    } else if (type === 'n') {
      // MÃ
      const bodyGeo = new THREE.CylinderGeometry(0.010, 0.015, 0.022, 16)
      const body = new THREE.Mesh(bodyGeo)
      body.position.y = 0.016
      group.add(body)

      const headGeo = new THREE.BoxGeometry(0.013, 0.020, 0.016)
      const head = new THREE.Mesh(headGeo)
      head.position.set(0, 0.030, 0.004)
      head.rotation.x = 0.25
      group.add(head)

      const snoutGeo = new THREE.BoxGeometry(0.011, 0.011, 0.013)
      const snout = new THREE.Mesh(snoutGeo)
      snout.position.set(0, 0.026, 0.012)
      group.add(snout)
    } else if (type === 'b') {
      // TƯỢNG
      const bodyGeo = new THREE.CylinderGeometry(0.009, 0.014, 0.028, 16)
      const body = new THREE.Mesh(bodyGeo)
      body.position.y = 0.019
      group.add(body)

      const headGeo = new THREE.SphereGeometry(0.009, 16, 16)
      headGeo.scale(1, 1.45, 1)
      const head = new THREE.Mesh(headGeo)
      head.position.y = 0.038
      group.add(head)

      const tipGeo = new THREE.SphereGeometry(0.003, 12, 12)
      const tip = new THREE.Mesh(tipGeo)
      tip.position.y = 0.052
      group.add(tip)
    } else if (type === 'q') {
      // HẬU
      const bodyGeo = new THREE.CylinderGeometry(0.011, 0.015, 0.034, 16)
      const body = new THREE.Mesh(bodyGeo)
      body.position.y = 0.022
      group.add(body)

      const crownGeo = new THREE.CylinderGeometry(0.015, 0.009, 0.010, 16)
      const crown = new THREE.Mesh(crownGeo)
      crown.position.y = 0.042
      group.add(crown)

      const jewelGeo = new THREE.SphereGeometry(0.004, 12, 12)
      const jewel = new THREE.Mesh(jewelGeo)
      jewel.position.y = 0.052
      group.add(jewel)
    } else if (type === 'k') {
      // VUA
      const bodyGeo = new THREE.CylinderGeometry(0.011, 0.015, 0.038, 16)
      const body = new THREE.Mesh(bodyGeo)
      body.position.y = 0.024
      group.add(body)

      const headGeo = new THREE.SphereGeometry(0.012, 16, 16)
      const head = new THREE.Mesh(headGeo)
      head.position.y = 0.048
      group.add(head)

      const crossVGeo = new THREE.BoxGeometry(0.003, 0.010, 0.003)
      const crossV = new THREE.Mesh(crossVGeo)
      crossV.position.y = 0.060
      group.add(crossV)

      const crossHGeo = new THREE.BoxGeometry(0.008, 0.003, 0.003)
      const crossH = new THREE.Mesh(crossHGeo)
      crossH.position.y = 0.061
      group.add(crossH)
    }

    return group
  }

  const createPieceMaterial = (color) => {
    if (color === 'w') {
      // QUÂN CỦA NGƯỜI CHƠI: Vàng Hoàng Kim 24K (Royal Gold), độ bóng kim loại cao
      return new THREE.MeshStandardMaterial({
        color: 0xffbe1a,        // Sắc vàng óng ánh kim
        emissive: 0x442800,     // Ánh kim quang ấm áp
        roughness: 0.16,        // Độ bóng gương phản chiếu ánh sáng
        metalness: 0.90,        // Kim loại nguyên khối cực sang trọng
      })
    } else {
      // QUÂN CỦA MÁY TÍNH: Thép Đen Hắc Ngọc (Obsidian Titanium)
      return new THREE.MeshStandardMaterial({
        color: 0x16171d,        // Đen titan huyền bí
        emissive: 0x150005,     // Ánh đỏ đen viền tối
        roughness: 0.24,
        metalness: 0.86,
      })
    }
  }

  // ============================================================================
  // XÂY DỰNG BÀN CỜ VUA 3D (CHESSBOARD 8x8)
  // ============================================================================
  const buildBoard = () => {
    boardRoot = new THREE.Group()
    targetRoot.add(boardRoot)

    // Đế bàn cờ
    const baseGeo = new THREE.BoxGeometry(BOARD_SIZE + 0.024, BOARD_SIZE + 0.024, 0.012)
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x0d1525,
      roughness: 0.4,
      metalness: 0.7,
    })
    const baseMesh = new THREE.Mesh(baseGeo, baseMat)
    baseMesh.position.z = -0.006
    boardRoot.add(baseMesh)

    // Viền Neon
    const borderGeo = new THREE.EdgesGeometry(baseGeo)
    const borderMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 })
    const borderLines = new THREE.LineSegments(borderGeo, borderMat)
    borderLines.position.z = -0.006
    boardRoot.add(borderLines)

    // 64 Ô cờ caro (Độ tương phản cao, tôn bật quân Vàng và quân Đen)
    const lightSquareMat = new THREE.MeshStandardMaterial({
      color: 0x5e7994,        // Đá Slate Xanh Lam mờ (tương phản mạnh với Vàng óng)
      roughness: 0.35,
      metalness: 0.25,
    })
    const darkSquareMat = new THREE.MeshStandardMaterial({
      color: 0x151e2d,        // Xanh Đen Than huyền bí (tôn bật đế vàng)
      roughness: 0.45,
      metalness: 0.40,
    })

    const squareGeo = new THREE.PlaneGeometry(SQUARE_SIZE * 0.98, SQUARE_SIZE * 0.98)

    for (let file = 0; file < 8; file++) {
      for (let rank = 0; rank < 8; rank++) {
        const isLight = (file + rank) % 2 === 1
        const mat = isLight ? lightSquareMat : darkSquareMat
        const sqMesh = new THREE.Mesh(squareGeo, mat)
        sqMesh.position.x = (file - 3.5) * SQUARE_SIZE
        sqMesh.position.y = (rank - 3.5) * SQUARE_SIZE
        sqMesh.position.z = 0.001

        const sqName = String.fromCharCode(97 + file) + (rank + 1)
        sqMesh.name = sqName
        sqMesh.userData = { square: sqName, isSquare: true }
        boardRoot.add(sqMesh)
      }
    }

    highlightGroup = new THREE.Group()
    highlightGroup.position.z = 0.003
    boardRoot.add(highlightGroup)

    pieceGroup = new THREE.Group()
    boardRoot.add(pieceGroup)
  }

  // ============================================================================
  // SPAWN & SYNC QUÂN CỜ 3D CHUẨN XÁC TUYỆT ĐỐI (KHÔNG MẤT QUÂN)
  // ============================================================================
  const spawnPiece = (square, piece) => {
    // Xóa mesh cũ ở ô này nếu có
    if (pieceMeshes[square]) {
      pieceGroup.remove(pieceMeshes[square])
      delete pieceMeshes[square]
    }

    const coords = squareToCoords(square)
    const pieceObj = createPieceGeometry(piece.type)
    const pieceMat = createPieceMaterial(piece.color)
    pieceObj.traverse((child) => {
      if (child.isMesh) child.material = pieceMat
      child.userData = { square: square, piece: piece, isPiece: true }
    })

    pieceObj.rotation.x = Math.PI / 2
    if (piece.color === 'b') pieceObj.rotation.y = Math.PI

    pieceObj.position.set(coords.x, coords.y, 0.005)
    pieceObj.userData = { square: square, piece: piece, isPiece: true }
    pieceGroup.add(pieceObj)
    pieceMeshes[square] = pieceObj
    return pieceObj
  }

  const syncPiecesFromGame = (lastMove = null) => {
    if (!game) return

    // 1. NẾU KHÔNG CÓ lastMove -> KHỞI TẠO HOẶC RESET LẠI TOÀN BỘ BÀN CỜ
    if (!lastMove) {
      while (pieceGroup.children.length > 0) {
        pieceGroup.remove(pieceGroup.children[0])
      }
      for (const sq in pieceMeshes) delete pieceMeshes[sq]
      movingPieces = []

      const board = game.board()
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const piece = board[r][f]
          if (piece) {
            const square = String.fromCharCode(97 + f) + (8 - r)
            spawnPiece(square, piece)
          }
        }
      }
      return
    }

    // 2. XỬ LÝ lastMove CỤ THỂ
    const { from, to, flags, piece, color, promotion } = lastMove

    // 2.1. Xử lý quân bị ăn (Bao gồm cả Bắt tốt qua đường En Passant)
    let capturedSquare = null
    if (flags && flags.includes('e')) {
      // En Passant: quân bị ăn nằm ở to[0] + from[1]
      capturedSquare = to[0] + from[1]
    } else if (flags && (flags.includes('c') || flags.includes('cp'))) {
      capturedSquare = to
    }

    if (capturedSquare && pieceMeshes[capturedSquare]) {
      pieceGroup.remove(pieceMeshes[capturedSquare])
      delete pieceMeshes[capturedSquare]
      playSound('capture')
    } else if (flags && (flags.includes('c') || flags.includes('cp'))) {
      playSound('capture')
    } else {
      playSound('move')
    }

    // 2.2. Xử lý di chuyển quân chính (từ from sang to)
    let movingMesh = pieceMeshes[from]
    delete pieceMeshes[from]

    if (flags && (flags.includes('p') || flags.includes('cp'))) {
      // Phong cấp (Promotion): xóa tốt cũ, tạo quân phong cấp mới (mặc định là Hậu 'q')
      if (movingMesh) pieceGroup.remove(movingMesh)
      movingMesh = spawnPiece(to, { type: promotion || 'q', color: color })
    } else if (movingMesh) {
      // Gán vào ô mới trong từ điển
      pieceMeshes[to] = movingMesh
      movingMesh.userData = { square: to, piece: { type: piece, color: color }, isPiece: true }
      movingMesh.traverse((c) => {
        c.userData = { square: to, piece: { type: piece, color: color }, isPiece: true }
      })

      const targetCoords = squareToCoords(to)
      movingPieces.push({
        mesh: movingMesh,
        targetX: targetCoords.x,
        targetY: targetCoords.y,
        startX: movingMesh.position.x,
        startY: movingMesh.position.y,
        progress: 0,
      })
    } else {
      // Dự phòng nếu mesh tại from bị thiếu: spawn ngay quân mới tại to
      spawnPiece(to, { type: piece, color: color })
    }

    // 2.3. Xử lý Nhập Thành (Castling: Vua và Xe cùng di chuyển)
    if (flags && flags.includes('k')) {
      // Nhập thành cánh Vua (O-O)
      const rookFrom = color === 'w' ? 'h1' : 'h8'
      const rookTo = color === 'w' ? 'f1' : 'f8'
      if (pieceMeshes[rookFrom]) {
        const rookMesh = pieceMeshes[rookFrom]
        delete pieceMeshes[rookFrom]
        pieceMeshes[rookTo] = rookMesh
        rookMesh.userData = { square: rookTo, piece: { type: 'r', color: color }, isPiece: true }
        rookMesh.traverse((c) => {
          c.userData = { square: rookTo, piece: { type: 'r', color: color }, isPiece: true }
        })
        const rookCoords = squareToCoords(rookTo)
        movingPieces.push({
          mesh: rookMesh,
          targetX: rookCoords.x,
          targetY: rookCoords.y,
          startX: rookMesh.position.x,
          startY: rookMesh.position.y,
          progress: 0,
        })
      }
    } else if (flags && flags.includes('q')) {
      // Nhập thành cánh Hậu (O-O-O)
      const rookFrom = color === 'w' ? 'a1' : 'a8'
      const rookTo = color === 'w' ? 'd1' : 'd8'
      if (pieceMeshes[rookFrom]) {
        const rookMesh = pieceMeshes[rookFrom]
        delete pieceMeshes[rookFrom]
        pieceMeshes[rookTo] = rookMesh
        rookMesh.userData = { square: rookTo, piece: { type: 'r', color: color }, isPiece: true }
        rookMesh.traverse((c) => {
          c.userData = { square: rookTo, piece: { type: 'r', color: color }, isPiece: true }
        })
        const rookCoords = squareToCoords(rookTo)
        movingPieces.push({
          mesh: rookMesh,
          targetX: rookCoords.x,
          targetY: rookCoords.y,
          startX: rookMesh.position.x,
          startY: rookMesh.position.y,
          progress: 0,
        })
      }
    }

    // 3. ĐỐI SOÁT TOÀN DIỆN VỚI BÀN CỜ (Reconcile an toàn)
    // Đảm bảo không bao giờ có quân lạc hoặc quân bị thiếu
    const board = game.board()
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f]
        const sq = String.fromCharCode(97 + f) + (8 - r)
        const mesh = pieceMeshes[sq]

        if (p) {
          if (!mesh) {
            // Thiếu quân -> spawn lại
            spawnPiece(sq, p)
          } else {
            // Cập nhật dữ liệu đồng bộ
            mesh.userData = { square: sq, piece: p, isPiece: true }
            mesh.traverse((c) => {
              c.userData = { square: sq, piece: p, isPiece: true }
            })
          }
        } else {
          // Ô trống: Nếu có mesh ở đây mà KHÔNG nằm trong movingPieces -> dọn dẹp
          if (mesh) {
            const isMoving = movingPieces.some(m => m.mesh === mesh)
            if (!isMoving) {
              pieceGroup.remove(mesh)
              delete pieceMeshes[sq]
            }
          }
        }
      }
    }
  }

  // ============================================================================
  // HIGHLIGHT QUÂN CHỌN & NƯỚC ĐI GỢI Ý
  // ============================================================================
  const updateHighlights = () => {
    while (highlightGroup.children.length > 0) {
      highlightGroup.remove(highlightGroup.children[0])
    }

    // Hạ các quân cờ khác về cao độ chuẩn
    for (const sq in pieceMeshes) {
      if (sq !== selectedSquare) {
        pieceMeshes[sq].position.z = 0.005
      }
    }

    // 1. Ô đang chọn: Vàng nếu có nước đi, Cam nếu bị cản/ghim
    if (selectedSquare) {
      const coords = squareToCoords(selectedSquare)
      const hasMoves = validMoveSquares.length > 0

      const selGeo = new THREE.PlaneGeometry(SQUARE_SIZE * 0.96, SQUARE_SIZE * 0.96)
      const selMat = new THREE.MeshBasicMaterial({
        color: hasMoves ? 0x00f0ff : 0xff4400,
        transparent: true,
        opacity: hasMoves ? 0.65 : 0.85,
      })
      const selMesh = new THREE.Mesh(selGeo, selMat)
      selMesh.position.set(coords.x, coords.y, 0.001)
      highlightGroup.add(selMesh)

      // Nhấc bổng quân cờ để người chơi thấy rõ đang được cầm lên (1.5cm)
      if (pieceMeshes[selectedSquare]) {
        pieceMeshes[selectedSquare].position.z = 0.018
      }
    }

    // 2. Các ô nước đi hợp lệ
    for (const move of validMoveSquares) {
      const coords = squareToCoords(move.to)
      const isCapture = move.captured !== undefined

      if (isCapture) {
        // Vòng tròn đỏ báo ăn quân
        const ringGeo = new THREE.RingGeometry(SQUARE_SIZE * 0.28, SQUARE_SIZE * 0.44, 24)
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2255, transparent: true, opacity: 0.92 })
        const ringMesh = new THREE.Mesh(ringGeo, ringMat)
        ringMesh.position.set(coords.x, coords.y, 0.002)
        ringMesh.name = move.to
        ringMesh.userData = { square: move.to, isMoveTarget: true }
        highlightGroup.add(ringMesh)
      } else {
        // Chấm xanh Cyan neon báo ô trống có thể đi
        const dotGeo = new THREE.CircleGeometry(SQUARE_SIZE * 0.20, 20)
        const dotMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 })
        const dotMesh = new THREE.Mesh(dotGeo, dotMat)
        dotMesh.position.set(coords.x, coords.y, 0.002)
        dotMesh.name = move.to
        dotMesh.userData = { square: move.to, isMoveTarget: true }
        highlightGroup.add(dotMesh)
      }
    }
  }

  // ============================================================================
  // THUẬT TOÁN AI MÁY TÍNH (MINIMAX + ALPHA-BETA PRUNING)
  // ============================================================================
  const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 }

  const PAWN_TABLE = [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5,  5, 10, 25, 25, 10,  5,  5],
    [0,  0,  0, 20, 20,  0,  0,  0],
    [5, -5,-10,  0,  0,-10, -5,  5],
    [5, 10, 10,-20,-20, 10, 10,  5],
    [0,  0,  0,  0,  0,  0,  0,  0]
  ]

  const KNIGHT_TABLE = [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
  ]

  const evaluateBoard = (chessGame) => {
    let totalScore = 0
    const board = chessGame.board()

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f]
        if (p) {
          let val = PIECE_VALUES[p.type] || 0
          if (p.type === 'p') val += (p.color === 'w' ? PAWN_TABLE[7 - r][f] : PAWN_TABLE[r][f])
          if (p.type === 'n') val += (p.color === 'w' ? KNIGHT_TABLE[7 - r][f] : KNIGHT_TABLE[r][f])
          totalScore += (p.color === 'w' ? val : -val)
        }
      }
    }
    return totalScore
  }

  const minimax = (chessGame, depth, alpha, beta, isMaximizing) => {
    if (depth === 0 || chessGame.game_over()) {
      return evaluateBoard(chessGame)
    }

    const moves = chessGame.moves()
    if (moves.length === 0) {
      return evaluateBoard(chessGame)
    }

    if (isMaximizing) {
      let maxEval = -Infinity
      for (const move of moves) {
        chessGame.move(move)
        const ev = minimax(chessGame, depth - 1, alpha, beta, false)
        chessGame.undo()
        maxEval = Math.max(maxEval, ev)
        alpha = Math.max(alpha, ev)
        if (beta <= alpha) break
      }
      return maxEval
    } else {
      let minEval = Infinity
      for (const move of moves) {
        chessGame.move(move)
        const ev = minimax(chessGame, depth - 1, alpha, beta, true)
        chessGame.undo()
        minEval = Math.min(minEval, ev)
        beta = Math.min(beta, ev)
        if (beta <= alpha) break
      }
      return minEval
    }
  }

  const makeAiMove = () => {
    if (!game || game.game_over() || game.turn() !== 'b') {
      isAiThinking = false
      updateHudStatus()
      return
    }

    isAiThinking = true
    updateHudStatus()

    setTimeout(() => {
      try {
        const moves = game.moves({ verbose: true })
        if (moves.length === 0) {
          if (game.game_over()) handleGameOver()
          return
        }

        let chosenMove = null

        if (currentDifficulty === 'easy') {
          // Dễ: 35% ăn quân nếu có, còn lại đi ngẫu nhiên
          const captureMoves = moves.filter(m => m.captured)
          if (captureMoves.length > 0 && Math.random() < 0.35) {
            chosenMove = captureMoves[Math.floor(Math.random() * captureMoves.length)]
          } else {
            chosenMove = moves[Math.floor(Math.random() * moves.length)]
          }
        } else if (currentDifficulty === 'medium') {
          // Vừa: Minimax depth 2
          let bestScore = Infinity
          for (const move of moves) {
            game.move(move)
            const score = minimax(game, 2, -Infinity, Infinity, true)
            game.undo()
            if (score < bestScore) {
              bestScore = score
              chosenMove = move
            }
          }
        } else {
          // Khó: Minimax depth 3 + ưu tiên duyệt nước ăn quân trước
          let bestScore = Infinity
          moves.sort((a, b) => (b.captured ? 10 : 0) - (a.captured ? 10 : 0))
          for (const move of moves) {
            game.move(move)
            const score = minimax(game, 3, -Infinity, Infinity, true)
            game.undo()
            if (score < bestScore) {
              bestScore = score
              chosenMove = move
            }
          }
        }

        if (!chosenMove) chosenMove = moves[0]

        const result = game.move(chosenMove)
        syncPiecesFromGame(result)

        if (game.in_check()) playSound('check')
        if (game.game_over()) handleGameOver()
      } catch (err) {
        console.error('[ChessModule] Lỗi tính AI:', err)
        try {
          const fallback = game.moves({ verbose: true })
          if (fallback.length > 0) {
            const res = game.move(fallback[0])
            syncPiecesFromGame(res)
          }
        } catch (e) {}
      } finally {
        isAiThinking = false
        updateHudStatus()
      }
    }, 350)
  }

  // ============================================================================
  // CẬP NHẬT TRẠNG THÁI GIAO DIỆN HUD
  // ============================================================================
  const updateHudStatus = () => {
    const hudTitle = document.getElementById('hud-status')
    const hudDetail = document.getElementById('hud-detail')
    if (!hudTitle || !hudDetail) return
    if (!targetRoot || !targetRoot.visible) return

    if (game.in_checkmate()) {
      isGameOver = true
      const winner = game.turn() === 'w' ? 'MÁY TÍNH (ĐEN)' : 'BẠN (QUÂN VÀNG)'
      hudTitle.innerText = '🏆 CHIẾU BÍ! ' + winner + ' THẮNG!'
      hudDetail.innerText = 'Bấm "Ván Mới" để chơi lại ván khác'
      playSound('win')
    } else if (game.in_draw() || game.in_stalemate()) {
      isGameOver = true
      hudTitle.innerText = '🤝 VÁN CỜ HÒA!'
      hudDetail.innerText = 'Cả 2 bên hòa cờ (Stalemate / Draw)'
    } else if (isAiThinking) {
      hudTitle.innerText = '🤖 MÁY ĐANG TÍNH NƯỚC CỜ (' + currentDifficulty.toUpperCase() + ')...'
      hudDetail.innerText = 'Vui lòng chờ AI đi quân Đen'
    } else if (game.turn() === 'w') {
      hudTitle.innerText = game.in_check() ? '⚠️ BẠN ĐANG BỊ CHIẾU TƯỚNG!' : '👉 LƯỢT CỦA BẠN (QUÂN VÀNG)'
      if (selectedSquare) {
        if (validMoveSquares.length > 0) {
          hudDetail.innerText = 'Chạm chấm xanh để đi (hoặc vòng đỏ để ăn quân)'
        } else {
          hudDetail.innerText = '⚠️ Quân này hiện bị cản hoặc ghim bảo vệ Vua, chọn quân khác!'
        }
      } else {
        hudDetail.innerText = 'Chạm trực tiếp vào quân cờ Vàng bất kỳ để chọn'
      }
    } else {
      hudTitle.innerText = '🤖 LƯỢT CỦA MÁY (ĐEN)'
      hudDetail.innerText = 'Đang đợi máy tính phản hồi...'
    }
  }

  const handleGameOver = () => {
    isGameOver = true
    updateHudStatus()
  }

  const restartGame = () => {
    if (!game) return
    game.reset()
    selectedSquare = null
    validMoveSquares = []
    isGameOver = false
    isAiThinking = false
    updateHighlights()
    syncPiecesFromGame(null)
    updateHudStatus()
    playSound('move')
  }

  // ============================================================================
  // XỬ LÝ CHẠM CẢM ỨNG RAYCASTING CHÍNH XÁC (Touch / Click)
  // ============================================================================
  const handleInteraction = (event) => {
    if (!targetRoot || !targetRoot.visible || isAiThinking || isGameOver) return
    if (!game || game.turn() !== 'w') return

    // Bỏ qua nếu chạm vào thanh HUD hoặc popup modal
    if (event.target && (event.target.closest('#ar-hud') || event.target.closest('.modal-overlay') || event.target.closest('button'))) {
      return
    }

    // Chặn xung đột kép giữa touchstart và click (debounce 250ms)
    const now = performance.now()
    if (now - lastTapTime < 250) return
    lastTapTime = now

    // Lấy tọa độ màn hình
    let clientX, clientY
    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX
      clientY = event.touches[0].clientY
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      clientX = event.changedTouches[0].clientX
      clientY = event.changedTouches[0].clientY
    } else {
      clientX = event.clientX
      clientY = event.clientY
    }

    if (clientX === undefined || clientY === undefined) return

    const canvas = document.getElementById('camerafeed')
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1

    if (!camera) return
    raycaster.setFromCamera(mouse, camera)

    // Raycast với tất cả vật thể trên bàn cờ
    const intersects = raycaster.intersectObjects(boardRoot.children, true)
    if (intersects.length === 0) return

    // TÌM Ô CỜ ĐƯỢC CHẠM CHÍNH XÁC (Truy ngược từ Mesh con lên Group)
    let clickedSquare = null
    for (const hit of intersects) {
      let cur = hit.object
      while (cur && cur !== boardRoot) {
        if (cur.userData && cur.userData.square) {
          clickedSquare = cur.userData.square
          break
        }
        if (cur.name && /^[a-h][1-8]$/.test(cur.name)) {
          clickedSquare = cur.name
          break
        }
        cur = cur.parent
      }
      if (clickedSquare) break
    }

    // Dự phòng tính toán qua tọa độ cục bộ nếu click vào nền đế
    if (!clickedSquare && intersects.length > 0) {
      const hit = intersects[0]
      const localHit = boardRoot.worldToLocal(hit.point.clone())
      clickedSquare = coordsToSquare(localHit.x, localHit.y)
    }

    if (!clickedSquare) return

    console.log('[ChessModule] Chạm vào ô:', clickedSquare)

    const pieceOnSquare = game.get(clickedSquare)

    // 1. NẾU ĐÃ CHỌN QUÂN VÀ CHẠM VÀO Ô ĐÍCH HỢP LỆ -> THỰC HIỆN NƯỚC ĐI
    if (selectedSquare) {
      const legalMove = validMoveSquares.find(m => m.to === clickedSquare)
      if (legalMove) {
        const result = game.move({
          from: selectedSquare,
          to: clickedSquare,
          promotion: 'q', // Mặc định phong Hậu
        })

        selectedSquare = null
        validMoveSquares = []
        updateHighlights()
        syncPiecesFromGame(result)
        updateHudStatus()

        if (game.in_check()) playSound('check')

        if (game.game_over()) {
          handleGameOver()
        } else {
          makeAiMove()
        }
        return
      }
    }

    // 2. NẾU CHẠM VÀO QUÂN CỦA MÌNH (QUÂN TRẮNG) -> CHỌN HOẶC ĐỔI QUÂN
    if (pieceOnSquare && pieceOnSquare.color === 'w') {
      if (selectedSquare === clickedSquare) {
        // Chạm lại lần nữa vào chính quân đó -> Hủy chọn
        selectedSquare = null
        validMoveSquares = []
      } else {
        // Chọn quân mới
        selectedSquare = clickedSquare
        validMoveSquares = game.moves({ square: clickedSquare, verbose: true })
        playSound('select')
      }
      updateHighlights()
      updateHudStatus()
      return
    }

    // 3. NẾU CHẠM VÀO Ô KHÔNG HỢP LỆ -> HỦY CHỌN
    selectedSquare = null
    validMoveSquares = []
    updateHighlights()
    updateHudStatus()
  }

  // ============================================================================
  // CẤU HÌNH GIAO DIỆN CHESS TRÊN HUD
  // ============================================================================
  let isUiSetup = false
  const setupChessUi = () => {
    if (isUiSetup) return
    isUiSetup = true

    const restartBtn = document.getElementById('chess-restart-btn')
    const undoBtn = document.getElementById('chess-undo-btn')
    const diffButtons = document.querySelectorAll('.diff-btn, .chess-diff-btn')

    console.log('[ChessModule] Cài đặt UI Chess, tìm thấy buttons:', {
      restart: !!restartBtn,
      undo: !!undoBtn,
      diffCount: diffButtons.length
    })

    if (restartBtn) {
      const handleRestart = (e) => {
        e.stopPropagation()
        e.preventDefault()
        console.log('[ChessModule] Bấm nút Ván Mới')
        restartGame()
      }
      restartBtn.addEventListener('click', handleRestart)
      restartBtn.addEventListener('touchend', handleRestart)
    }

    if (undoBtn) {
      const handleUndo = (e) => {
        e.stopPropagation()
        e.preventDefault()
        console.log('[ChessModule] Bấm nút Đi Lại')
        if (game && !isAiThinking && game.history().length >= 2) {
          game.undo() // Hoàn tác nước của AI
          game.undo() // Hoàn tác nước của người chơi
          selectedSquare = null
          validMoveSquares = []
          updateHighlights()
          syncPiecesFromGame(null)
          updateHudStatus()
          playSound('move')
        }
      }
      undoBtn.addEventListener('click', handleUndo)
      undoBtn.addEventListener('touchend', handleUndo)
    }

    diffButtons.forEach(btn => {
      const handleDiff = (e) => {
        e.stopPropagation()
        e.preventDefault()
        diffButtons.forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        currentDifficulty = btn.getAttribute('data-diff') || 'medium'
        console.log('[ChessModule] Đã chọn độ khó AI:', currentDifficulty)
        playSound('select')
        updateHudStatus()
      }
      btn.addEventListener('click', handleDiff)
      btn.addEventListener('touchend', handleDiff)
    })
  }

  // ============================================================================
  // PIPELINE MODULE LIFECYCLE
  // ============================================================================
  const showChess = (detail) => {
    if (!detail) return
    targetRoot.visible = true

    // Dừng video GOSU nếu đang chạy khi quét trúng Cờ Vua
    const arVideo = document.getElementById('ar-video')
    if (arVideo && !arVideo.paused) {
      arVideo.pause()
    }

    if (detail.position) targetRoot.position.copy(detail.position)
    if (detail.rotation) targetRoot.quaternion.copy(detail.rotation)
    if (detail.scale) {
      targetRoot.scale.set(detail.scale, detail.scale, detail.scale)
    }

    const soundBtn = document.getElementById('sound-btn')
    const camelWalkBtn = document.getElementById('camel-walk-btn')
    const chessHud = document.getElementById('chess-hud')

    if (soundBtn) soundBtn.style.display = 'none'
    if (camelWalkBtn) camelWalkBtn.style.display = 'none'
    if (chessHud) chessHud.style.display = 'flex'

    const hudDot = document.getElementById('hud-dot')
    if (hudDot) hudDot.className = 'hud-indicator found'

    updateHudStatus()
  }

  const hideChess = () => {
    if (!targetRoot) return
    targetRoot.visible = false

    const chessHud = document.getElementById('chess-hud')
    if (chessHud) chessHud.style.display = 'none'

    const hudDot = document.getElementById('hud-dot')
    const hudTitle = document.getElementById('hud-status')
    const hudDetail = document.getElementById('hud-detail')

    if (hudDot) hudDot.className = 'hud-indicator lost'
    if (hudTitle) hudTitle.innerText = '🔔 ĐÃ MẤT DẤU ẢNH CHESS'
    if (hudDetail) hudDetail.innerText = 'Hãy hướng camera lại gần tấm ảnh cờ vua'
  }

    // Khởi tạo bàn cờ, UI controls & hook debug ngay lập tức
  buildBoard()
  syncPiecesFromGame(null)
  setupChessUi()

  window.__chessTarget = {
    showChess,
    hideChess,
    getGame: () => game,
    syncPiecesFromGame,
    makeAiMove,
    restartGame,
    getPieceMeshes: () => pieceMeshes,
    getSelectedSquare: () => selectedSquare,
    getValidMoveSquares: () => validMoveSquares,
    handleInteraction,
    getTargetRoot: () => targetRoot,
    getBoardRoot: () => boardRoot,
  }

  return {
    name: 'chess-target-pipeline-module',

    onStart: () => {
      console.log('[ChessModule] Khởi động bàn cờ vua Three.js 3D...')
      const { scene, camera: xrCamera } = XR8.Threejs.xrScene()
      camera = xrCamera

      const ambientLight = new THREE.AmbientLight(0xffffff, 2.2)
      scene.add(ambientLight)

      const dirLight = new THREE.DirectionalLight(0xffffff, 2.5)
      dirLight.position.set(2, 4, 5)
      scene.add(dirLight)

      const rimLight = new THREE.PointLight(0x00f0ff, 2.0, 3)
      rimLight.position.set(0, 0, 0.4)
      scene.add(rimLight)

      if (targetRoot.parent !== scene) scene.add(targetRoot)
      setupChessUi()

      // Lắng nghe sự kiện chạm trực tiếp trên canvas và window
      const canvas = document.getElementById('camerafeed')
      if (canvas) {
        canvas.addEventListener('touchstart', handleInteraction, { passive: true })
        canvas.addEventListener('pointerdown', handleInteraction, { passive: true })
      }
      window.addEventListener('click', handleInteraction, { passive: true })

      // Lắng nghe sự kiện custom window để hỗ trợ test giả lập
      window.addEventListener('reality.imagefound', (e) => {
        if (e.detail && e.detail.name === 'chess') showChess(e.detail)
      })
      window.addEventListener('reality.imageupdated', (e) => {
        if (e.detail && e.detail.name === 'chess') showChess(e.detail)
      })
      window.addEventListener('reality.imagelost', (e) => {
        if (e.detail && e.detail.name === 'chess') hideChess()
      })

      // Expose debug/test hooks
      window.__chessTarget = {
        showChess,
        hideChess,
        getGame: () => game,
        syncPiecesFromGame,
        makeAiMove,
        restartGame,
        getPieceMeshes: () => pieceMeshes,
        getSelectedSquare: () => selectedSquare,
        getValidMoveSquares: () => validMoveSquares,
        handleInteraction,
      }
    },

    listeners: [
      {
        event: 'reality.imagefound',
        process: ({ detail }) => {
          if (detail.name === 'chess') showChess(detail)
        },
      },
      {
        event: 'reality.imageupdated',
        process: ({ detail }) => {
          if (detail.name === 'chess') showChess(detail)
        },
      },
      {
        event: 'reality.imagelost',
        process: ({ detail }) => {
          if (detail.name === 'chess') hideChess()
        },
      },
    ],

    onUpdate: () => {
      if (movingPieces.length > 0) {
        for (let i = movingPieces.length - 1; i >= 0; i--) {
          const item = movingPieces[i]
          item.progress += 0.08

          if (item.progress >= 1.0) {
            item.mesh.position.x = item.targetX
            item.mesh.position.y = item.targetY
            item.mesh.position.z = 0.005
            movingPieces.splice(i, 1)
          } else {
            item.mesh.position.x = THREE.MathUtils.lerp(item.startX, item.targetX, item.progress)
            item.mesh.position.y = THREE.MathUtils.lerp(item.startY, item.targetY, item.progress)
            item.mesh.position.z = 0.005 + Math.sin(item.progress * Math.PI) * 0.02
          }
        }
      }
    },
  }
}
