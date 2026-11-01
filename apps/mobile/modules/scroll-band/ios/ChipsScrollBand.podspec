Pod::Spec.new do |s|
  s.name           = 'ChipsScrollBand'
  s.version        = '1.0.0'
  s.summary        = 'A band over the top of a list that UIKit lowers as the list scrolls'
  s.description    = 'The glass under a tab name, placed from the scroll view itself'
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
