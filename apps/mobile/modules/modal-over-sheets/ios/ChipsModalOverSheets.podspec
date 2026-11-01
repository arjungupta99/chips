Pod::Spec.new do |s|
  s.name           = 'ChipsModalOverSheets'
  s.version        = '1.0.0'
  s.summary        = 'A modal comes up over whatever sheet is up'
  s.description    = "React Native's modal presented from the topmost view controller, and dismissed with what stands over it"
  s.license        = 'FSL-1.1-ALv2'
  s.author         = 'Chips'
  s.homepage       = 'https://github.com/arjungupta99/chips'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.source_files = '**/*.m'
end
