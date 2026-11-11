Pod::Spec.new do |s|
  s.name           = 'ChipsLinkReach'
  s.version        = '1.0.0'
  s.summary        = 'Whether this phone can reach a link on Tailscale or a private network'
  s.description    = 'Looks a name up and reads the phone tunnels: a Tailscale one, or another VPN'
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
