Pod::Spec.new do |s|
  s.name           = 'ChipsPhoneBar'
  s.version        = '1.0.0'
  s.summary        = 'What the tab bar drawn on an iPhone asks of UIKit'
  s.description    = 'Whether a list is being read, from the scroll view itself, and a tab chosen as a finger on UIKit own bar would choose it'
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
