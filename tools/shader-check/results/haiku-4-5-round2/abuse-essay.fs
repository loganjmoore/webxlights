/*{
  "DESCRIPTION": "Cascading colored waves that flow continuously across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "wavelength", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 2.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Handle vertical displays by using x for animation when height is minimal
  float animCoord = (RENDERSIZE.y < 2.0) ? uv.y : uv.x;
  float crossCoord = (RENDERSIZE.y < 2.0) ? uv.x : uv.y;
  
  // Create flowing wave pattern
  float wave = sin((animCoord - TIME * speed * 0.5) * wavelength * 6.28318) * 0.5 + 0.5;
  float wave2 = sin((animCoord - TIME * speed * 0.4 + 2.09440) * wavelength * 6.28318) * 0.5 + 0.5;
  float wave3 = sin((animCoord - TIME * speed * 0.3 + 4.18880) * wavelength * 6.28318) * 0.5 + 0.5;
  
  // Mix colors based on wave patterns
  vec3 color = mix(colorA.rgb, colorB.rgb, wave);
  color = mix(color, colorC.rgb, wave2 * 0.6);
  
  // Add brightness modulation for dynamic effect
  float brightness = 0.7 + 0.3 * wave3;
  
  gl_FragColor = vec4(color * brightness, 1.0);
}
