'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarMenuBadge,
} from '@/components/ui/sidebar'

export function NavMain({
  items,
  label,
}: {
  items: {
    title: string
    url?: string
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    icon?: any
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    hugeIcon?: any
    isActive?: boolean
    badge?: number
    items?: {
      title: string
      url: string
    }[]
  }[]
  label?: string
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => {
          const isItemActive = item.url ? pathname.startsWith(item.url) : false
          const isAnyChildActive = item.items?.some((subItem) => pathname.startsWith(subItem.url))

          if (item.items && item.items.length > 0) {
            return (
              <Collapsible
                key={item.title}
                asChild
                defaultOpen={item.isActive || isAnyChildActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip={item.title}>
                      {item.hugeIcon ? (
                        <HugeiconsIcon icon={item.hugeIcon} />
                      ) : (
                        item.icon && <item.icon />
                      )}
                      <span>{item.title}</span>
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                      />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map((subItem) => {
                        const isSubItemActive = pathname.startsWith(subItem.url)
                        return (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild isActive={isSubItemActive}>
                              <Link href={subItem.url}>
                                <span>{subItem.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            )
          }

          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild tooltip={item.title} isActive={isItemActive}>
                <Link href={item.url!}>
                  {item.hugeIcon ? (
                    <HugeiconsIcon icon={item.hugeIcon} />
                  ) : (
                    item.icon && <item.icon />
                  )}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
              {item.badge !== undefined && item.badge > 0 && (
                <SidebarMenuBadge className="bg-accent text-accent-foreground font-semibold px-1.5 py-0.5 rounded-full text-[10px]">
                  {item.badge}
                </SidebarMenuBadge>
              )}
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
