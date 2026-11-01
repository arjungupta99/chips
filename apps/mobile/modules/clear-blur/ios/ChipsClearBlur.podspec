Pod::Spec.new do |s|
  s.name           = 'ChipsClearBlur'
  s.version        = '1.0.0'
  s.summary        = 'A blur with no tint over it'
  s.description    = 'The band under a tab name and a room bar, blurred without a material'
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
