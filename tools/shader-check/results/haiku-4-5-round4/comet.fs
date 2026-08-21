/*{
  "DESCRIPTION": "A bright comet with a trailing tail circling the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorComet", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.5, 1.0] },
    { "NAME": "colorTail", "TYPE": "color", "DEFAULT": [0.0, 0.5, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "tailLength", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.8 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 center = vec2(0.5, 0.5);
  vec2 toPixel = uv - center;
  
  float angle = atan(toPixel.y, toPixel.x);
  float distance = length(toPixel);
  
  float cometAngle = TIME * speed * 0.5;
  float angleDiff = angle - cometAngle;
  
  angleDiff = fract(angleDiff / 6.28318);
  if (angleDiff > 0.5) angleDiff = 1.0 - angleDiff;
  
  float radius = 0.35;
  float cometTrail = smoothstep(0.08, 0.0, abs(distance - radius));
  
  float tailFade = smoothstep(tailLength, -0.2, angleDiff * 4.0);
  float tail = smoothstep(0.06, 0.0, abs(distance - radius)) * tailFade;
  
  vec3 color = mix(colorTail.rgb, colorComet.rgb, cometTrail);
  float brightness = max(cometTrail, tail * 0.6);
  
  gl_FragColor = vec4(color * brightness, 1.0);
}
