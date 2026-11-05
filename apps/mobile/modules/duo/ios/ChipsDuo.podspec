Pod::Spec.new do |s|
  s.name           = 'ChipsDuo'
  s.version        = '1.0.0'
  s.summary        = 'Where the iPhone Duo keeps its column of bars, and where it folds'
  s.description    = 'The edge iOS stands its vertical bar on and how wide it is, and the fold, said from a view at the root of the window'
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
