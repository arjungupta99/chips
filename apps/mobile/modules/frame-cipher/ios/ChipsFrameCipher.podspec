Pod::Spec.new do |s|
  s.name           = 'ChipsFrameCipher'
  s.version        = '1.0.0'
  s.summary        = 'AES-GCM for the tunnel, in CryptoKit'
  s.description    = 'Seals and opens a relay frame natively, in one synchronous call each way'
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
