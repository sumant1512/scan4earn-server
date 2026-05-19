const express = require('express');
const router = express.Router();
const controller = require('../controllers/publicScan.controller');
const rateLimit = require('express-rate-limit');

// Generic IP limiter to prevent bursts
const ipLimiter = rateLimit({
	windowMs: 60 * 1000, // 1 min
	max: 120,
	standardHeaders: true,
	legacyHeaders: false,
	handler: (req, res) => {
		res.status(429).json({ success: false, error: 'rate_limited', retry_after: req.rateLimit.resetTime });
	}
});

// Limit session starts per coupon/device/IP
const startLimiter = rateLimit({
	windowMs: 10 * 60 * 1000, // 10 min
	max: 60,
	keyGenerator: (req) => {
		const body = req.body || {};
		return `coupon:${body.coupon_code || 'unknown'}|device:${body.device_id || 'unknown'}|ip:${req.ip}`;
	},
	standardHeaders: true,
	legacyHeaders: false,
	handler: (req, res) => {
		res.status(429).json({ success: false, error: 'rate_limited_start', retry_after: req.rateLimit.resetTime });
	}
});

// Limit OTP collection per mobile per day
const mobileLimiter = rateLimit({
	windowMs: 24 * 60 * 60 * 1000, // 24 hours
	max: 10,
	keyGenerator: (req) => {
		const body = req.body || {};
		return body.mobile_e164 || req.ip;
	},
	standardHeaders: true,
	legacyHeaders: false,
	handler: (req, res) => {
		res.status(429).json({ success: false, error: 'rate_limited_mobile', retry_after: req.rateLimit.resetTime });
	}
});

// Limit OTP verification attempts per session
const verifyLimiter = rateLimit({
	windowMs: 10 * 60 * 1000, // 10 min
	max: 20,
	keyGenerator: (req) => `session:${req.params.sessionId}|ip:${req.ip}`,
	standardHeaders: true,
	legacyHeaders: false,
	handler: (req, res) => {
		res.status(429).json({ success: false, error: 'rate_limited_verify', retry_after: req.rateLimit.resetTime });
	}
});

router.post('/start', ipLimiter, startLimiter, controller.startSession);
router.post('/:sessionId/mobile', ipLimiter, mobileLimiter, controller.collectMobile);
router.post('/:sessionId/verify-otp', ipLimiter, verifyLimiter, controller.verifyOtp);

module.exports = router;
