// server.js - API Server cho Facebook Auto Tool
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Khởi tạo Express app
const app = express();
app.use(express.json());
app.use(cors());

// ===== CẤU HÌNH =====
const CONFIG = {
  // API key - Sử dụng API key đã tạo trước đó
  apiKey: "fb_auto_tool_api_key_8a7b9c6d5e4f3g2h1i0j_2024_05_15",
  
  // Port mặc định (có thể ghi đè bằng biến môi trường PORT)
  port: process.env.PORT || 3000,
  
  // Đường dẫn file lưu trữ dữ liệu người dùng
  userDataPath: path.join(__dirname, 'users.json'),
  
  // Đường dẫn file lưu trữ dữ liệu phiên
  sessionDataPath: path.join(__dirname, 'sessions.json'),
  
  // Thời gian hết hạn mặc định (nếu không được chỉ định) - 7 ngày
  defaultExpiryDays: 7,
  
  // Thời gian tối đa giữa các yêu cầu (để ngăn tấn công brute force) - 1 giây
  rateLimitMs: 1000
};

// ===== QUẢN LÝ DỮ LIỆU =====

// Đọc dữ liệu người dùng từ file
function readUserData() {
  try {
    if (fs.existsSync(CONFIG.userDataPath)) {
      const data = fs.readFileSync(CONFIG.userDataPath, 'utf8');
      return JSON.parse(data);
    }
    // Nếu file không tồn tại, tạo dữ liệu mẫu
    const sampleData = {
      "admin": {
        role: "admin",
        expiryDays: 365,
        active: true,
        createdAt: Date.now()
      },
      "user123": {
        role: "user",
        expiryDays: 30,
        active: true,
        createdAt: Date.now()
      },
      "demo": {
        role: "demo",
        expiryDays: 1,
        active: true,
        createdAt: Date.now()
      }
    };
    // Lưu dữ liệu mẫu vào file
    fs.writeFileSync(CONFIG.userDataPath, JSON.stringify(sampleData, null, 2));
    return sampleData;
  } catch (error) {
    console.error('Lỗi khi đọc dữ liệu người dùng:', error);
    return {};
  }
}

// Lưu dữ liệu người dùng vào file
function saveUserData(data) {
  try {
    fs.writeFileSync(CONFIG.userDataPath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu dữ liệu người dùng:', error);
    return false;
  }
}

// Đọc dữ liệu phiên từ file
function readSessionData() {
  try {
    if (fs.existsSync(CONFIG.sessionDataPath)) {
      const data = fs.readFileSync(CONFIG.sessionDataPath, 'utf8');
      return JSON.parse(data);
    }
    // Nếu file không tồn tại, tạo file trống
    fs.writeFileSync(CONFIG.sessionDataPath, JSON.stringify({}));
    return {};
  } catch (error) {
    console.error('Lỗi khi đọc dữ liệu phiên:', error);
    return {};
  }
}

// Lưu dữ liệu phiên vào file
function saveSessionData(data) {
  try {
    fs.writeFileSync(CONFIG.sessionDataPath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu dữ liệu phiên:', error);
    return false;
  }
}

// Tạo ID phiên ngẫu nhiên
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

// Xóa các phiên hết hạn
function cleanupExpiredSessions() {
  const sessions = readSessionData();
  const now = Date.now();
  let changed = false;
  
  Object.keys(sessions).forEach(sessionId => {
    if (sessions[sessionId].expiresAt < now) {
      delete sessions[sessionId];
      changed = true;
    }
  });
  
  if (changed) {
    saveSessionData(sessions);
  }
}

// Chạy dọn dẹp phiên định kỳ (mỗi giờ)
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// ===== MIDDLEWARE =====

// Middleware kiểm tra API key
function validateApiKey(req, res, next) {
  const apiKey = req.body.apiKey;
  
  if (!apiKey || apiKey !== CONFIG.apiKey) {
    return res.status(403).json({
      valid: false,
      message: "API key không hợp lệ hoặc thiếu"
    });
  }
  
  next();
}

// Middleware giới hạn tần suất yêu cầu
const lastRequestTime = {};

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  
  if (lastRequestTime[ip] && now - lastRequestTime[ip] < CONFIG.rateLimitMs) {
    return res.status(429).json({
      valid: false,
      message: "Quá nhiều yêu cầu, vui lòng thử lại sau"
    });
  }
  
  lastRequestTime[ip] = now;
  next();
}

// ===== ROUTES =====

// Route xác thực mật khẩu
app.post('/validate-password', rateLimit, validateApiKey, (req, res) => {
  try {
    const { password, tool, timestamp } = req.body;
    
    if (!password) {
      return res.status(400).json({
        valid: false,
        message: "Thiếu mật khẩu"
      });
    }
    
    // Đọc dữ liệu người dùng
    const users = readUserData();
    
    // Kiểm tra mật khẩu
    if (users[password]) {
      const user = users[password];
      
      // Kiểm tra trạng thái tài khoản
      if (!user.active) {
        return res.status(403).json({
          valid: false,
          message: "Tài khoản đã bị vô hiệu hóa"
        });
      }
      
      // Tạo ID phiên
      const sessionId = generateSessionId();
      
      // Tính thời gian hết hạn
      const expiryDays = user.expiryDays || CONFIG.defaultExpiryDays;
      const expiresAt = Date.now() + (expiryDays * 24 * 60 * 60 * 1000);
      
      // Lưu thông tin phiên
      const sessions = readSessionData();
      sessions[sessionId] = {
        username: password,
        role: user.role,
        tool: tool || 'unknown',
        createdAt: Date.now(),
        expiresAt: expiresAt,
        lastUsed: Date.now()
      };
      saveSessionData(sessions);
      
      // Cập nhật thời gian sử dụng cuối cùng
      users[password].lastLogin = Date.now();
      saveUserData(users);
      
      // Trả về kết quả thành công
      return res.json({
        valid: true,
        message: `Xin chào! Tài khoản ${user.role} của bạn đã được kích hoạt.`,
        expiryDays: expiryDays,
        sessionId: sessionId
      });
    }
    
    // Mật khẩu không đúng
    return res.status(401).json({
      valid: false,
      message: "Mật khẩu không hợp lệ"
    });
  } catch (error) {
    console.error('Lỗi trong validate-password:', error);
    return res.status(500).json({
      valid: false,
      message: "Lỗi máy chủ"
    });
  }
});

// Route kiểm tra trạng thái giấy phép
app.post('/validate-password/check-license', rateLimit, validateApiKey, (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        valid: false,
        message: "Thiếu ID phiên"
      });
    }
    
    // Đọc dữ liệu phiên
    const sessions = readSessionData();
    
    // Kiểm tra phiên
    if (!sessions[sessionId]) {
      return res.json({
        valid: false,
        message: "Phiên đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại."
      });
    }
    
    const session = sessions[sessionId];
    const now = Date.now();
    
    // Kiểm tra thời hạn
    if (session.expiresAt < now) {
      // Xóa phiên hết hạn
      delete sessions[sessionId];
      saveSessionData(sessions);
      
      return res.json({
        valid: false,
        message: "Giấy phép của bạn đã hết hạn. Vui lòng gia hạn."
      });
    }
    
    // Đọc dữ liệu người dùng
    const users = readUserData();
    const username = session.username;
    
    // Kiểm tra trạng thái người dùng
    if (!users[username] || !users[username].active) {
      // Xóa phiên
      delete sessions[sessionId];
      saveSessionData(sessions);
      
      return res.json({
        valid: false,
        message: "Tài khoản của bạn đã bị vô hiệu hóa."
      });
    }
    
    // Cập nhật thời gian sử dụng cuối cùng
    session.lastUsed = now;
    saveSessionData(sessions);
    
    // Tính số ngày còn lại
    const daysRemaining = Math.ceil((session.expiresAt - now) / (24 * 60 * 60 * 1000));
    
    // Trả về thông tin giấy phép
    return res.json({
      valid: true,
      message: `Giấy phép hợp lệ. Hết hạn trong ${daysRemaining} ngày.`,
      role: session.role,
      expiresAt: session.expiresAt,
      daysRemaining: daysRemaining
    });
  } catch (error) {
    console.error('Lỗi trong check-license:', error);
    return res.status(500).json({
      valid: true, // Trả về true trong trường hợp lỗi để không làm gián đoạn người dùng
      message: "Lỗi khi kiểm tra giấy phép. Tiếp tục với xác thực hạn chế."
    });
  }
});

// Route quản lý người dùng (thêm người dùng mới)
app.post('/admin/add-user', rateLimit, validateApiKey, (req, res) => {
  try {
    const { adminPassword, newUser } = req.body;
    
    if (!adminPassword || !newUser || !newUser.username || !newUser.role) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin cần thiết"
      });
    }
    
    // Đọc dữ liệu người dùng
    const users = readUserData();
    
    // Kiểm tra quyền admin
    if (!users[adminPassword] || users[adminPassword].role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Không có quyền thực hiện hành động này"
      });
    }
    
    // Kiểm tra nếu người dùng đã tồn tại
    if (users[newUser.username]) {
      return res.status(409).json({
        success: false,
        message: "Người dùng đã tồn tại"
      });
    }
    
    // Thêm người dùng mới
    users[newUser.username] = {
      role: newUser.role,
      expiryDays: newUser.expiryDays || CONFIG.defaultExpiryDays,
      active: true,
      createdAt: Date.now(),
      createdBy: adminPassword
    };
    
    // Lưu dữ liệu
    if (saveUserData(users)) {
      return res.json({
        success: true,
        message: "Thêm người dùng thành công",
        user: {
          username: newUser.username,
          role: users[newUser.username].role,
          expiryDays: users[newUser.username].expiryDays
        }
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Lỗi khi lưu dữ liệu người dùng"
      });
    }
  } catch (error) {
    console.error('Lỗi trong add-user:', error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ"
    });
  }
});

// Route vô hiệu hóa người dùng
app.post('/admin/disable-user', rateLimit, validateApiKey, (req, res) => {
  try {
    const { adminPassword, username } = req.body;
    
    if (!adminPassword || !username) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin cần thiết"
      });
    }
    
    // Đọc dữ liệu người dùng
    const users = readUserData();
    
    // Kiểm tra quyền admin
    if (!users[adminPassword] || users[adminPassword].role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Không có quyền thực hiện hành động này"
      });
    }
    
    // Kiểm tra nếu người dùng tồn tại
    if (!users[username]) {
      return res.status(404).json({
        success: false,
        message: "Người dùng không tồn tại"
      });
    }
    
    // Không thể vô hiệu hóa tài khoản admin
    if (users[username].role === 'admin') {
      return res.status(403).json({
        success: false,
        message: "Không thể vô hiệu hóa tài khoản admin"
      });
    }
    
    // Vô hiệu hóa người dùng
    users[username].active = false;
    users[username].disabledAt = Date.now();
    users[username].disabledBy = adminPassword;
    
    // Lưu dữ liệu
    if (saveUserData(users)) {
      // Xóa tất cả phiên của người dùng này
      const sessions = readSessionData();
      let sessionChanged = false;
      
      Object.keys(sessions).forEach(sessionId => {
        if (sessions[sessionId].username === username) {
          delete sessions[sessionId];
          sessionChanged = true;
        }
      });
      
      if (sessionChanged) {
        saveSessionData(sessions);
      }
      
      return res.json({
        success: true,
        message: "Vô hiệu hóa người dùng thành công"
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Lỗi khi lưu dữ liệu người dùng"
      });
    }
  } catch (error) {
    console.error('Lỗi trong disable-user:', error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ"
    });
  }
});

// Route lấy danh sách người dùng (chỉ dành cho admin)
app.post('/admin/list-users', rateLimit, validateApiKey, (req, res) => {
  try {
    const { adminPassword } = req.body;
    
    if (!adminPassword) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin cần thiết"
      });
    }
    
    // Đọc dữ liệu người dùng
    const users = readUserData();
    
    // Kiểm tra quyền admin
    if (!users[adminPassword] || users[adminPassword].role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Không có quyền thực hiện hành động này"
      });
    }
    
    // Chuẩn bị danh sách người dùng (loại bỏ thông tin nhạy cảm)
    const userList = Object.keys(users).map(username => {
      const user = users[username];
      return {
        username,
        role: user.role,
        expiryDays: user.expiryDays,
        active: user.active,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      };
    });
    
    return res.json({
      success: true,
      users: userList
    });
  } catch (error) {
    console.error('Lỗi trong list-users:', error);
    return res.status(500).json({
      success: false,
      message: "Lỗi máy chủ"
    });
  }
});

// Route kiểm tra trạng thái máy chủ
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: Date.now(),
    version: '1.0.0'
  });
});

// ===== KHỞI ĐỘNG SERVER =====

// Khởi tạo dữ liệu nếu chưa tồn tại
readUserData();
readSessionData();

// Khởi động server
app.listen(CONFIG.port, () => {
  console.log(`API server đang chạy tại http://localhost:${CONFIG.port}`);
  console.log('Các endpoint có sẵn:');
  console.log('- POST /validate-password');
  console.log('- POST /validate-password/check-license');
  console.log('- POST /admin/add-user');
  console.log('- POST /admin/disable-user');
  console.log('- POST /admin/list-users');
  console.log('- GET /status');
});

// Xử lý tắt server
process.on('SIGINT', () => {
  console.log('Đang tắt server...');
  process.exit(0);
});
