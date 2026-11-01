Pod::Spec.new do |s|
  s.name           = 'ChipsPushSeal'
  s.version        = '1.0.0'
  s.summary        = 'The key the words of a push are sealed to'
  s.description    = 'Makes 32 random bytes once and keeps them in the keychain group the notification extension shares'
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
