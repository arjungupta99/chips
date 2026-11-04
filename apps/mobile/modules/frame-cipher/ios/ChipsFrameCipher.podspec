Pod::Spec.new do |s|
  s.name           = 'ChipsFrameCipher'
  s.version        = '1.0.0'
  s.summary        = 'Crypto for the phone, in CryptoKit'
  s.description    = 'AES-GCM, X25519, Ed25519 and HMAC-SHA-256 natively, one synchronous call each'
  s.license        = 'FSL-1.1-ALv2'
  s.author         = 'Chips'
  s.homepage       = 'https://github.com/arjungupta99/chips'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
