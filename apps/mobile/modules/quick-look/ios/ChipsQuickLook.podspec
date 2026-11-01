Pod::Spec.new do |s|
  s.name           = 'ChipsQuickLook'
  s.version        = '1.0.0'
  s.summary        = 'A file a room was sent, shown in Quick Look'
  s.description    = 'QLPreviewController over the app, for a PDF, an Office or iWork document, or any file iOS can show'
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
