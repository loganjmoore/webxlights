/*{
  "DESCRIPTION": "Green streaks falling like digital rain across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.5, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "density", "TYPE": "float", "MIN": 1.0, "MAX": 20.0, "DEFAULT": 8.0 },
    { "NAME": "streakLength", "TYPE": "float", "MIN": 0.05, "MAX": 0.5, "DEFAULT": 0.2 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // For roofline displays, use x-axis when height is minimal
  vec2 coord = (RENDERSIZE.y < 2.0) ? vec2(uv.y, uv.x) : uv;
  
  // Create falling streaks using modulo for seamless looping
  float fall = mod(coord.y + TIME * speed, 1.0);
  
  // Hash-like pattern for multiple independent streaks
  float streamPos = floor(coord.x * density);
  float streamSeed = fract(sin(streamPos * 12.9898) * 43758.5453);
  
  // Offset each stream slightly for variation
  float streamOffset = fract(streamSeed * 3.14159);
  fall = mod(fall + streamOffset, 1.0);
  
  // Detect if we're within a falling streak
  float streakDist = abs(fall - 0.5);
  float inStreak = smoothstep(streakLength, 0.0, streakDist);
  
  // Brightness gradient along the streak (bright at top, dimmer at bottom)
  float brightness = mix(0.3, 1.0, 1.0 - streakDist / streakLength);
  brightness *= inStreak;
  
  // Mix between two shades of green based on stream
  vec3 color = mix(colorB.rgb, colorA.rgb, fract(streamSeed * 2.71828));
  
  gl_FragColor = vec4(color * brightness, 1.0);
}
