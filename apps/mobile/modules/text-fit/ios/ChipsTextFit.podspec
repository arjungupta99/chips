Pod::Spec.new do |s|
  s.name           = 'ChipsTextFit'
  s.version        = '1.0.0'
  s.summary        = 'A paragraph drawn whole'
  s.description    = 'React Native draws text in its frame put back on the pixel grid, so a last line is never lost'
  s.license        = 'FSL-1.1-ALv2'
  s.author         = 'Chips'
  s.homepage       = 'https://github.com/arjungupta99/chips'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.source_files = '**/*.mm'
  s.dependency 'React-FabricComponents'
  install_modules_dependencies(s)
end
