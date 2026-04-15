import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.widgets import Slider

def create_camera_sim():
    # --- 設定値 ---
    fov_deg = 66.0      # 画角（度）
    room_height = 250   # 部屋の高さ（cm）
    room_depth = 340    # 部屋の奥行（cm）
    
    # 障害物（カーテンレール）の設定
    obst_height = 205.0 # 床からの高さ (cm)
    obst_depth = 10.0   # 壁からの距離 (cm)

    fig, ax = plt.subplots(figsize=(10, 7))
    plt.subplots_adjust(left=0.1, bottom=0.25)

    # 初期値を天井（room_height）に設定
    init_cam_y = 250.0  
    init_angle = 35.0   # 天井設置時に見やすいよう少し角度を調整

    def calculate_lines(cam_y, angle_deg):
        center_angle = np.radians(angle_deg)
        half_fov = np.radians(fov_deg / 2)
        
        angle_upper = center_angle - half_fov
        angle_center = center_angle
        angle_lower = center_angle + half_fov
        
        x_range = np.linspace(0, room_depth, 200) # 精度向上のため分割数を増加
        
        y_upper = cam_y - x_range * np.tan(angle_upper)
        y_center = cam_y - x_range * np.tan(angle_center)
        y_lower = cam_y - x_range * np.tan(angle_lower)
        
        return x_range, y_upper, y_center, y_lower

    x_r, y_u, y_c, y_l = calculate_lines(init_cam_y, init_angle)
    
    line_u, = ax.plot(x_r, y_u, 'r--', linewidth=1, label='Upper Bound', alpha=0.5)
    line_c, = ax.plot(x_r, y_c, 'g-',  linewidth=1.5, label='Center Line (Angle)')
    line_l, = ax.plot(x_r, y_l, 'b--', linewidth=1, label='Lower Bound', alpha=0.5)
    
    fill_visible = ax.fill_between(x_r, y_u, y_l, color='yellow', alpha=0.3, label='Visible Area')
    fill_blocked = ax.fill_between(x_r, y_u, y_u, color='gray', alpha=0.1)

    obstacle = ax.add_patch(patches.Rectangle((0, obst_height), obst_depth, 5, color='gray', label='Obstacle'))
    camera_pt, = ax.plot(0, init_cam_y, 'ko', markersize=10, label='Camera', zorder=5)

    # グラフの装飾
    ax.set_xlim(room_depth, 0)
    ax.set_ylim(0, room_height + 10) # 天井が見えやすいよう少し余裕を持たせる
    ax.set_aspect('equal')
    ax.set_xlabel('Distance from Wall (cm)')
    ax.set_ylabel('Height from Floor (cm)')
    ax.set_title(f'Camera Simulation (Ceiling Height: {room_height}cm)')
    ax.grid(True, linestyle=':')
    ax.legend(loc='upper left')

    # スライダーの配置
    ax_y = plt.axes((0.2, 0.1, 0.6, 0.03))
    ax_angle = plt.axes((0.2, 0.05, 0.6, 0.03))

    slider_y = Slider(ax_y, 'Height', 0, room_height, valinit=init_cam_y)
    slider_angle = Slider(ax_angle, 'Angle', -20, 90, valinit=init_angle)

    def update(val):
        cam_y = slider_y.val
        angle = slider_angle.val
        
        nonlocal fill_visible, fill_blocked
        x_r, y_u, y_c, y_l = calculate_lines(cam_y, angle)
        
        # 遮蔽計算
        angle_to_obst = np.arctan2(cam_y - obst_height, obst_depth)
        y_block_boundary = cam_y - x_r * np.tan(angle_to_obst)
        angle_upper = np.radians(angle - fov_deg/2)

        line_u.set_ydata(y_u)
        line_c.set_ydata(y_c)
        line_l.set_ydata(y_l)
        camera_pt.set_ydata([cam_y])
        
        fill_visible.remove()
        fill_blocked.remove()

        # 床と天井で視界をクリップ
        y_u_clipped = np.clip(y_u, 0, room_height)
        y_l_clipped = np.clip(y_l, 0, room_height)
        y_block_clipped = np.clip(y_block_boundary, 0, room_height)

        if angle_upper < angle_to_obst:
            upper_limit_visible = np.minimum(y_u_clipped, y_block_clipped)
            fill_visible = ax.fill_between(x_r, upper_limit_visible, y_l_clipped, color='yellow', alpha=0.3, where=(y_l_clipped < upper_limit_visible))
            fill_blocked = ax.fill_between(x_r, y_u_clipped, upper_limit_visible, color='gray', alpha=0.1, where=(y_u_clipped > upper_limit_visible))
        else:
            fill_visible = ax.fill_between(x_r, y_u_clipped, y_l_clipped, color='yellow', alpha=0.3)
            fill_blocked = ax.fill_between(x_r, y_u_clipped, y_u_clipped, color='gray', alpha=0.1)
            
        fig.canvas.draw_idle()

    slider_y.on_changed(update)
    slider_angle.on_changed(update)
    update(None) # 初回描画の更新

    plt.show()

if __name__ == "__main__":
    create_camera_sim()