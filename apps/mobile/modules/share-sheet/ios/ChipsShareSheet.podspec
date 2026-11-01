Pod::Spec.new do |s|
  s.name           = 'ChipsShareSheet'
  s.version        = '1.0.0'
  s.summary        = 'Words handed to the share sheet, sliding up from the bottom'
  s.description    = 'UIActivityViewController presented as itself, not as a popover with nothing to point at'
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
