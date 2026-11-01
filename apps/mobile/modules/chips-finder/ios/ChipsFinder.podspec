Pod::Spec.new do |s|
  s.name           = 'ChipsFinder'
  s.version        = '1.0.0'
  s.summary        = 'Chips servers on this Wi-Fi, found over Bonjour'
  s.description    = 'Browses _chips._tcp for a few seconds and answers with each server it resolved: its name, address, port and record'
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
