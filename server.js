// API Server cho Facebook Auto Tool
import express from "express"
import cors from "cors"
import crypto from "crypto"

const app = express()
app.use(express.json())
app.use(cors())

// Cấu hình bảo mật
const API_KEY = process.env.API_KEY || "nam123" // Sử dụng biến môi trường
const SECRET_KEY = process.env.SECRET_KEY || "your-secret-key-here" // Khóa bí mật để mã hóa

// Cơ sở dữ liệu người dùng đơn giản (trong thực tế nên sử dụng cơ sở dữ liệu thực)
const users = {
  // Mật khẩu và thông tin người dùng
  "nam123": {
    role: "admin",
    expiryDays: 30,
    active: true,
  },
  "user-password": {
    role: "user",
    expiryDays: 7,
    active: true,
  },
  "demo-password": {
    role: "demo",
    expiryDays: 1,
    active: true,
  },
}

// Danh sách phiên đăng nhập
const sessions = {}

// Endpoint kiểm tra trạng thái
app.get("/status", (req, res) => {
  res.json({
    status: "online",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  })
})

// Xác thực mật khẩu
app.post("/validate-password", (req, res) => {
  try {
    // Kiểm tra API key
    if (req.body.apiKey !== API_KEY) {
      return res.status(403).json({
        valid: false,
        message: "Invalid API key",
      })
    }

    const { password, tool, timestamp } = req.body

    // Kiểm tra mật khẩu
    if (users[password]) {
      const user = users[password]

      // Kiểm tra trạng thái tài khoản
      if (!user.active) {
        return res.status(403).json({
          valid: false,
          message: "Account is disabled",
        })
      }

      // Tạo ID phiên
      const sessionId = crypto.randomBytes(16).toString("hex")

      // Lưu thông tin phiên
      sessions[sessionId] = {
        password,
        role: user.role,
        createdAt: Date.now(),
        expiresAt: Date.now() + user.expiryDays * 24 * 60 * 60 * 1000,
        tool,
      }

      // Trả về kết quả thành công
      return res.json({
        valid: true,
        message: `Welcome! Your ${user.role} account is active.`,
        expiryDays: user.expiryDays,
        sessionId,
      })
    }

    // Mật khẩu không đúng
    return res.status(401).json({
      valid: false,
      message: "Invalid password",
    })
  } catch (error) {
    console.error("Error in validate-password:", error)
    return res.status(500).json({
      valid: false,
      message: "Server error",
    })
  }
})

// Kiểm tra trạng thái giấy phép
app.post("/validate-password/check-license", (req, res) => {
  try {
    // Kiểm tra API key
    if (req.body.apiKey !== API_KEY) {
      return res.status(403).json({
        valid: false,
        message: "Invalid API key",
      })
    }

    const { sessionId } = req.body

    // Kiểm tra phiên
    if (!sessionId || !sessions[sessionId]) {
      return res.json({
        valid: false,
        message: "Session expired or invalid. Please login again.",
      })
    }

    const session = sessions[sessionId]

    // Kiểm tra thời hạn
    if (session.expiresAt < Date.now()) {
      // Xóa phiên hết hạn
      delete sessions[sessionId]

      return res.json({
        valid: false,
        message: "Your license has expired. Please renew.",
      })
    }

    // Kiểm tra trạng thái người dùng
    const user = users[session.password]
    if (!user || !user.active) {
      delete sessions[sessionId]

      return res.json({
        valid: false,
        message: "Your account has been disabled.",
      })
    }

    // Trả về thông tin giấy phép
    return res.json({
      valid: true,
      message: `License valid. Expires in ${Math.ceil((session.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))} days.`,
      role: session.role,
      expiresAt: session.expiresAt,
    })
  } catch (error) {
    console.error("Error in check-license:", error)
    return res.status(500).json({
      valid: true, // Trả về true trong trường hợp lỗi để không làm gián đoạn người dùng
      message: "Error checking license. Continuing with limited validation.",
    })
  }
})

// API quản lý người dùng (chỉ dành cho admin)
app.post("/admin/add-user", (req, res) => {
  try {
    const { apiKey, adminPassword, newUser } = req.body

    // Kiểm tra API key và quyền admin
    if (apiKey !== API_KEY || !users[adminPassword] || users[adminPassword].role !== "admin") {
      return res.status(403).json({ success: false, message: "Unauthorized" })
    }

    // Thêm người dùng mới
    users[newUser.password] = {
      role: newUser.role || "user",
      expiryDays: newUser.expiryDays || 7,
      active: true,
    }

    return res.json({
      success: true,
      message: "User added successfully",
      users: Object.keys(users).length,
    })
  } catch (error) {
    console.error("Error in add-user:", error)
    return res.status(500).json({ success: false, message: "Server error" })
  }
})

// Khởi động server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`)
  console.log(`Available passwords: nam123 ${Object.keys(users).join(", ")}`)
})
